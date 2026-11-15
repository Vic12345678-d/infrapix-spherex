"""
SPHEREx Blink - backend (FastAPI).  ONE FILE, no patches needed.

    pip install -r requirements.txt
    SPHEREX_WORKERS=1 uvicorn app:app          # then open http://localhost:8000

WHAT IT DOES
  Give it a place on the sky (RA/Dec, or a name such as "Barnard's Star").
  It finds every SPHEREx exposure covering that place (NASA/IPAC IRSA archive),
  downloads a small cutout of each, lines them all up on one common sky grid
  (north up, east left) and returns them as a "blink" movie.  Anything that
  moves or changes brightness between frames jumps out.

HOW MOVING OBJECTS ARE HANDLED  (the important bit)
  Nearby stars drift across the sky ("proper motion", mas/yr).  Barnard's Star
  moves ~10 arcsec every year, so by 2026 it is NOT where the J2000 catalogue
  says.  Two display modes, switched with `follow`:
    follow=1 (default): every frame is centred on where the object was on THAT
                        frame's date.  The object stays in the cyan circle and
                        the background stars drift past it.
    follow=0          : the sky stays fixed; the cyan circle moves instead.

DATA FLOW
  /api/resolve  name -> RA, Dec, proper motion  (built-in table, then SIMBAD)
  /api/frames   the blink frames + difference frames + spectrum/light curve
  /api/grid     one exposure per detector (the object in 6 infrared colours)
  /api/gif      the blink as an animated GIF
  /api/gaia, /api/wise   catalogue stars for overlays (via VizieR)

SETTINGS (environment variables, all optional)
  SPHEREX_WORKERS     parallel downloads (default 2; use 1 if IRSA says 503)
  SPHEREX_COLLECTION  comma list of IRSA collections (default spherex_dr1,spherex_qr3)
  SPHEREX_CACHE       folder for downloaded cutouts (default ./cache)

Unverified assumptions are marked VERIFY below.
"""
import base64, hashlib, io, logging, os, re, threading, time
from concurrent.futures import ThreadPoolExecutor
from functools import lru_cache

import numpy as np
import requests
import astropy.units as u
from astropy.coordinates import SkyCoord
from astropy.io import fits
from astropy.io.votable import parse_single_table
from astropy.wcs import WCS
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from PIL import Image
from reproject import reproject_interp

# ============================================================== 1. SETTINGS
log = logging.getLogger("spherex")
logging.basicConfig(level=logging.INFO)
logging.getLogger("astropy").setLevel(logging.ERROR)
import warnings
warnings.filterwarnings("ignore", message="All-NaN slice")   # silence harmless SIP warnings

WORKERS = int(os.environ.get("SPHEREX_WORKERS", "2"))
COLLECTIONS = [c.strip() for c in os.environ.get(
    "SPHEREX_COLLECTION", "spherex_dr1,spherex_qr3").split(",") if c.strip()]
SIA_URL = "https://irsa.ipac.caltech.edu/SIA"
TAP_URL = "https://irsa.ipac.caltech.edu/TAP"
CACHE_DIR = os.environ.get("SPHEREX_CACHE", "cache")
# Server-side cutout query. VERIFY against the IRSA SPHEREx tutorial notebooks.
CUTOUT_TEMPLATE = "{url}?center={ra},{dec}&size={fov}"
# Flag bits treated as bad. VERIFY against the SPHEREx Explanatory Supplement.
# Bits 0-2 are NOT masked: on bright stars (e.g. Barnard's Star) they mark saturated/transient
# pixels, and masking them erased the very object we want to see.
BAD_BITS = (6, 7, 9, 10)
BAD_MASK = sum(1 << b for b in BAD_BITS)
os.makedirs(CACHE_DIR, exist_ok=True)

app = FastAPI(title="SPHEREx Blink")
# Lets a separate website page call this API (embed index.html anywhere).
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["GET"],
                   allow_headers=["*"])


# =============================================================== 2. TARGETS
# Only the two targets whose numbers were given with the challenge are built in.
# Everything else is looked up (Sesame for position, SIMBAD for proper motion).
KNOWN_TARGETS = {
    "barnard's star": (269.452077, 4.693365, -798.58, 10328.12),
    "wise j085510.83-071442.5": (133.795129, -7.245147, -8118.0, 680.0),
    "wise 0855-0714": (133.795129, -7.245147, -8118.0, 680.0),
}


def decimal_year(mjd):
    return 2000.0 + (mjd - 51544.5) / 365.25


def position_at(ra, dec, pmra, pmdec, epoch, year):
    """Where an object (RA/Dec valid at `epoch`) is at decimal `year`.
    pmra is mu_alpha* (already includes cos dec), as in SIMBAD and Gaia."""
    dt = year - epoch
    return (ra + pmra * dt / 3.6e6 / np.cos(np.radians(dec)),
            dec + pmdec * dt / 3.6e6)


SIMBAD_BASES = ("https://simbad.cds.unistra.fr/simbad/sim-tap/sync",
                "https://simbad.u-strasbg.fr/simbad/sim-tap/sync")


def _tap_rows(query):
    """Run an ADQL query on SIMBAD. Tries several routes; logs the real error of each."""
    form = dict(request="doQuery", lang="adql", format="json", query=query)
    errors = []
    for base in SIMBAD_BASES:
        for method in ("post", "get"):
            try:
                r = (requests.post(base, data=form, timeout=30) if method == "post"
                     else requests.get(base, params=form, timeout=30))
                r.raise_for_status()
                return r.json().get("data", [])
            except Exception as e:  # noqa: BLE001
                errors.append(f"{method} {base.split('/')[2]}: {str(e)[:160]}")
    try:
        from astroquery.simbad import Simbad
        t = Simbad.query_tap(query)
        return [[None if np.ma.is_masked(x) else x for x in row] for row in t]
    except Exception as e:  # noqa: BLE001
        errors.append(f"astroquery: {str(e)[:160]}")
    raise RuntimeError("SIMBAD unreachable | " + " | ".join(errors))


def _num(x):
    return float(x) if x is not None and np.isfinite(float(x)) else None


def _simbad_by_name(name):
    """SIMBAD wants its own identifier spelling, so try a few."""
    for cand in (name, "* " + name, "V* " + name, "NAME " + name):
        q = ("SELECT ra, dec, pmra, pmdec FROM basic JOIN ident ON oidref = oid "
             "WHERE id = '%s'" % cand.replace("'", "''"))
        rows = _tap_rows(q)
        if rows:
            return rows[0]
    return None


def _sesame(name):
    for cand in (name, "* " + name, "V* " + name):
        try:
            c = SkyCoord.from_name(cand)
            return float(c.ra.deg), float(c.dec.deg)
        except Exception:  # noqa: BLE001
            continue
    return None


def _simbad_by_position(ra, dec, radius_arcsec=5.0):
    q = ("SELECT TOP 1 ra, dec, pmra, pmdec FROM basic WHERE 1 = CONTAINS("
         f"POINT('ICRS', ra, dec), CIRCLE('ICRS', {ra}, {dec}, {radius_arcsec / 3600})) "
         f"ORDER BY DISTANCE(POINT('ICRS', ra, dec), POINT('ICRS', {ra}, {dec}))")
    rows = _tap_rows(q)
    return rows[0] if rows else None


@app.get("/api/resolve")
def resolve(name: str, epoch: float = 2026.0):
    """Name -> position moved to `epoch`, plus proper motion (mas/yr).
    Works for any SIMBAD object. pm_found=False means no proper motion was available."""
    got = KNOWN_TARGETS.get(" ".join(name.lower().split()))
    pm_found = got is not None
    if got is None:
        row = None
        try:
            row = _simbad_by_name(name)
            if row is None:                          # SIMBAD spelling failed: Sesame + position
                pos = _sesame(name)
                if pos is None:
                    raise HTTPException(404, f"Could not resolve '{name}'")
                row = _simbad_by_position(*pos) or (pos[0], pos[1], None, None)
        except HTTPException:
            raise
        except Exception as e:  # noqa: BLE001
            log.warning("SIMBAD lookup failed (%s); using Sesame only", str(e)[:600])
            pos = _sesame(name)
            if pos is None:
                raise HTTPException(404, f"Could not resolve '{name}'")
            row = (pos[0], pos[1], None, None)
        ra, dec, pmra, pmdec = float(row[0]), float(row[1]), _num(row[2]), _num(row[3])
        pm_found = pmra is not None and pmdec is not None
        got = (ra, dec, pmra or 0.0, pmdec or 0.0)
    ra, dec, pmra, pmdec = got
    ra_e, dec_e = position_at(ra, dec, pmra, pmdec, 2000.0, epoch)
    return dict(ra=ra_e, dec=dec_e, ra2000=ra, dec2000=dec, pmra=pmra, pmdec=pmdec,
                epoch=epoch, pm_found=pm_found)


# ================================================================= 3. SEARCH
def _sia_direct(coord, radius_arcsec):
    r = requests.get(SIA_URL, params={
        "COLLECTION": COLLECTIONS,
        "POS": f"CIRCLE {coord.ra.deg} {coord.dec.deg} {radius_arcsec / 3600.0}",
        "RESPONSEFORMAT": "VOTABLE"}, timeout=120)
    r.raise_for_status()
    return parse_single_table(io.BytesIO(r.content)).to_table(use_names_over_ids=True)


def _sia_astroquery(coord, radius_arcsec):
    from astroquery.ipac.irsa import Irsa
    return Irsa.query_sia(pos=(coord, radius_arcsec * u.arcsec), collection=COLLECTIONS)


def _tap(coord, radius_arcsec):
    import pyvo
    q = f"""SELECT 'https://irsa.ipac.caltech.edu/' || a.uri AS access_url,
                   p.energy_bandpassname, p.time_bounds_lower AS t_min
            FROM spherex.artifact a JOIN spherex.plane p ON a.planeid = p.planeid
            WHERE 1 = CONTAINS(POINT('ICRS', {coord.ra.deg}, {coord.dec.deg}), p.poly)
            ORDER BY p.time_bounds_lower"""
    return pyvo.dal.TAPService(TAP_URL).search(q).to_table()


def _urls_from(t):
    """Pull FITS URLs out of a result table whatever the column is called."""
    log.info("search result: %d rows", len(t))
    if len(t) == 0:
        return []
    cols = {c.lower(): c for c in t.colnames}
    for k in ("access_url", "accessurl"):
        if k in cols:
            return [str(x) for x in t[cols[k]]]
    for c in t.colnames:                       # unnamed columns: find URLs by content
        if any(str(v).startswith("http") and ".fits" in str(v).lower() for v in t[c][:20]):
            return [str(x) for x in t[c]]
    raise KeyError(f"no URL column found; got {t.colnames}")


@lru_cache(maxsize=64)
def search_urls(ra, dec, radius_arcsec=5.0, retries=3):
    """All SPHEREx FITS URLs covering the position. Tries 3 IRSA routes in turn."""
    coord = SkyCoord(ra * u.deg, dec * u.deg)
    got_empty = False
    for label, fn in (("direct SIA2", _sia_direct), ("astroquery SIA", _sia_astroquery),
                      ("TAP", _tap)):
        for attempt in range(retries):
            try:
                urls = [x for x in _urls_from(fn(coord, radius_arcsec)) if ".fits" in x.lower()]
                log.info("%s: %d images", label, len(urls))
                if urls:
                    return tuple(dict.fromkeys(urls))
                got_empty = True
                break
            except Exception as e:  # noqa: BLE001
                log.warning("%s attempt %d failed: %s", label, attempt + 1, str(e)[:160])
                time.sleep(2 * (attempt + 1))
    if got_empty:
        return ()
    raise HTTPException(502, "All IRSA search routes failed; IRSA may be down.")


# =============================================================== 4. DOWNLOAD
_dl_guard = threading.Lock()
_dl_locks = {}


def fetch_cutout(url, ra, dec, fov):
    """Download one cutout to the disk cache (retries on IRSA 503/429, verifies the file)."""
    full = CUTOUT_TEMPLATE.format(url=url, ra=ra, dec=dec, fov=fov)
    path = os.path.join(CACHE_DIR, hashlib.sha1(full.encode()).hexdigest() + ".fits")
    if os.path.exists(path):
        return path
    with _dl_guard:
        lock = _dl_locks.setdefault(path, threading.Lock())
    with lock:
        if os.path.exists(path):
            return path
        wait = 5
        for attempt in range(1, 7):
            tmp = f"{path}.{os.getpid()}.{threading.get_ident()}.part"
            try:
                with requests.get(full, stream=True, timeout=300) as r:
                    if r.status_code in (429, 500, 502, 503, 504):
                        hdr = r.headers.get("Retry-After", "")
                        pause = int(hdr) if hdr.isdigit() else wait
                        log.warning("IRSA busy (%s), waiting %ss [%d/6] %s",
                                    r.status_code, pause, attempt, url[-34:])
                        time.sleep(pause)
                        wait = min(wait * 2, 60)
                        continue
                    r.raise_for_status()
                    expected = int(r.headers.get("Content-Length") or 0)
                    size = 0
                    with open(tmp, "wb") as f:
                        for chunk in r.iter_content(1 << 20):
                            f.write(chunk)
                            size += len(chunk)
                if expected and size != expected:
                    raise IOError(f"truncated download {size}/{expected}")
                with fits.open(tmp) as h:                # must decode cleanly
                    _ = h["IMAGE"].data
                os.replace(tmp, path)
                return path
            except Exception as e:  # noqa: BLE001
                log.warning("download error [%d/6] %s: %s", attempt, url[-34:], str(e)[:100])
                time.sleep(wait)
                wait = min(wait * 2, 60)
            finally:
                if os.path.exists(tmp):
                    os.remove(tmp)
        return None


# ============================================================ 5. FRAME MAKING
def target_wcs(ra, dec, n, scale):
    """Output sky grid: n x n pixels, `scale` arcsec/pixel, TAN, north up, east left."""
    w = WCS(naxis=2)
    w.wcs.ctype = ["RA---TAN", "DEC--TAN"]
    w.wcs.crval = [ra, dec]
    w.wcs.crpix = [(n + 1) / 2, (n + 1) / 2]
    w.wcs.cdelt = [-scale / 3600.0, scale / 3600.0]
    return w


def process(path, ra, dec, n, scale, pmra, pmdec, epoch, follow):
    """One cutout -> a frame dict (aligned image + brightness of the object)."""
    try:
        with fits.open(path) as h:
            hdr = h["IMAGE"].header
            img = h["IMAGE"].data.astype(float)
            if "ZODI" in h:                                   # zodiacal light
                img = img - h["ZODI"].data
            if "FLAGS" in h:                                  # bad pixels
                img[(h["FLAGS"].data.astype(np.int64) & BAD_MASK) != 0] = np.nan
            wave = None
            try:                                              # wavelength varies per pixel
                ny, nx = img.shape
                yy, xx = np.mgrid[0:ny, 0:nx]
                wave = np.asarray(WCS(hdr, h, key="W").pixel_to_world_values(xx, yy)[0], float)
            except Exception:  # noqa: BLE001
                pass
            mjd = float(hdr.get("MJD-AVG", np.nan))
            year = decimal_year(mjd) if np.isfinite(mjd) else epoch
            # where is the object on this frame's date?
            ora, odec = position_at(ra, dec, pmra, pmdec, epoch, year)
            # follow: grid centred on the object; otherwise grid fixed on (ra, dec)
            cra, cdec = (ora, odec) if follow else (ra, dec)
            wout = target_wcs(cra, cdec, n, scale)
            win = WCS(hdr)
            out, foot = reproject_interp((img, win), wout, shape_out=(n, n))
            out[foot < 0.5] = np.nan
            wl = np.nan
            if wave is not None:
                wo, _ = reproject_interp((wave, win), wout, shape_out=(n, n))
                wl = float(wo[n // 2, n // 2])
            meta = dict(mjd=mjd, year=year, det=int(hdr.get("DETECTOR", 0)),
                        obsid=str(hdr.get("OBSID", "")), cra=cra, cdec=cdec)
    except Exception as e:  # noqa: BLE001
        log.warning("skip %s: %s", path, e)
        return None
    if np.isfinite(out).sum() < 0.3 * n * n:
        return None                                           # mostly outside the cutout
    out = out - np.nanmedian(out)                             # remove frame-to-frame offsets
    # brightness inside a ~7" aperture centred on the object's position on this date
    dE = (ora - cra) * np.cos(np.radians(cdec)) * 3600.0
    dN = (odec - cdec) * 3600.0
    cx = (n - 1) / 2
    yy, xx = np.mgrid[0:n, 0:n]
    r = np.hypot(xx - (cx - dE / scale), yy - (cx + dN / scale))
    ap = out[r <= 7.0 / scale]
    ap = ap[np.isfinite(ap)]
    if len(ap) == 0:
        return None
    mad = 1.4826 * np.nanmedian(np.abs(out - np.nanmedian(out)))
    meta.update(image=out, wl=wl, flux=float(np.mean(ap)), err=float(mad / np.sqrt(len(ap))))
    return meta


@lru_cache(maxsize=8)
def build_frames(ra, dec, fov, scale, max_frames, detector, pmra, pmdec, epoch, follow):
    n = int(round(fov * 3600 / scale))
    urls = search_urls(round(ra, 5), round(dec, 5))
    if detector:
        urls = tuple(x for x in urls if re.search(rf"D{detector}_spx", x))
    if len(urls) > max_frames:                                # evenly spaced subset
        step = len(urls) / max_frames
        urls = tuple(urls[int(i * step)] for i in range(max_frames))
    if not urls:
        raise HTTPException(404, "No SPHEREx images cover this position.")

    def work(url):
        p = fetch_cutout(url, ra, dec, fov)
        f = process(p, ra, dec, n, scale, pmra, pmdec, epoch, follow) if p else None
        if f and not f["det"]:
            m = re.search(r"D(\d)_spx", url)
            f["det"] = int(m.group(1)) if m else 0
        return f

    with ThreadPoolExecutor(WORKERS) as ex:
        frames = [f for f in ex.map(work, urls) if f]
    if not frames:
        raise HTTPException(503, "IRSA is throttling downloads (or the cutouts were empty). "
                                 "Wait ~1 minute and press Load frames again; files already "
                                 "downloaded are kept.")
    log.info("built %d/%d frames", len(frames), len(urls))
    frames.sort(key=lambda f: f["mjd"])
    return n, tuple(frames)


_build_lock = threading.Lock()      # a second click waits for the first, then hits the cache


def build_frames_locked(*a):
    with _build_lock:
        return build_frames(*a)


def bin_frames(frames, days):
    """Average frames that are within `days` of each other (deeper image, fewer frames)."""
    if days <= 0:
        return list(frames)
    groups, cur = [], []
    for f in frames:
        if cur and f["mjd"] - cur[0]["mjd"] > days:
            groups.append(cur)
            cur = []
        cur.append(f)
    if cur:
        groups.append(cur)
    mean = lambda k, g: float(np.mean([x[k] for x in g]))  # noqa: E731
    return [dict(image=np.nanmean([x["image"] for x in g], axis=0), mjd=mean("mjd", g),
                 year=mean("year", g), cra=mean("cra", g), cdec=mean("cdec", g),
                 det=g[0]["det"] if len({x["det"] for x in g}) == 1 else 0,
                 wl=float(np.nanmean([x["wl"] for x in g])), flux=mean("flux", g),
                 err=float(np.sqrt(np.sum([x["err"] ** 2 for x in g])) / len(g)),
                 obsid=f"{len(g)} stacked") for g in groups]


# ============================================================== 6. PICTURES
MASKED_RGB = (20, 90, 110)      # teal = masked / no data (so it is not mistaken for dark sky)


def zlimits(a):
    """DS9-style ZScale limits (same stretch as the team's spherex_fetch.py)."""
    from astropy.visualization import ZScaleInterval
    v = np.asarray(a, float)
    v = v[np.isfinite(v)]
    if v.size < 10:
        return 0.0, 1.0
    lo, hi = ZScaleInterval().get_limits(v)
    return (lo, hi) if hi > lo else (float(v.min()), float(v.max()) + 1e-9)


def gray_u8(a, lo, hi, diff):
    """Greyscale (RGB) picture; masked pixels are teal."""
    if diff:
        x = np.clip(0.5 + a / (hi - lo + 1e-12), 0, 1)
    else:
        x = np.clip((a - lo) / (hi - lo + 1e-12), 0, 1)
        x = np.arcsinh(10 * x) / np.arcsinh(10)
    x = np.flipud(x)
    g = (np.nan_to_num(x, nan=0.0) * 255).astype(np.uint8)
    rgb = np.stack([g, g, g], axis=-1)
    rgb[~np.isfinite(x)] = MASKED_RGB
    return rgb


def diverge_rgb(a, s):
    """Blue (fainter) - white - red (brighter), saturating at +-5 sigma. Masked = teal."""
    x = np.clip(a / (5 * s), -1, 1)
    bad = ~np.isfinite(x)
    x = np.nan_to_num(x, nan=0.0)
    ch = [np.interp(x, [-1, 0, 1], c) for c in ([33, 247, 178], [102, 247, 24], [172, 247, 43])]
    rgb = np.stack(ch, axis=-1).astype(np.uint8)
    rgb[bad] = MASKED_RGB
    return np.flipud(rgb)


def inferno_rgb(a):
    """Black-purple-orange-yellow colour map (like matplotlib 'inferno'). Masked = teal."""
    lo, hi = zlimits(a)
    x = np.clip((a - lo) / (hi - lo + 1e-12), 0, 1)
    x = np.arcsinh(10 * x) / np.arcsinh(10)
    x = np.flipud(x)
    bad = ~np.isfinite(x)
    x = np.nan_to_num(x, nan=0.0)
    cols = [(0, 0, 4), (87, 16, 110), (188, 55, 84), (249, 142, 9), (252, 255, 164)]
    rgb = np.stack([np.interp(x, [0, .25, .5, .75, 1], [c[i] for c in cols])
                    for i in range(3)], -1).astype(np.uint8)
    rgb[bad] = MASKED_RGB
    return rgb


def uri(arr):
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


# ================================================================== 7. API
def prepare(ra, dec, fov, scale, detector, bin_days, mode, max_frames, pmra, pmdec, epoch, follow):
    n, allf = build_frames_locked(round(ra, 6), round(dec, 6), round(fov, 4), round(scale, 2),
                                  max_frames, detector, round(pmra, 3), round(pmdec, 3),
                                  round(epoch, 2), bool(follow))
    sel = [f for f in allf if detector == 0 or f["det"] == detector]
    if not sel:
        raise HTTPException(404, "No usable frames (try another detector or position).")
    spectrum = [dict(wl=f["wl"], flux=f["flux"], err=f["err"], det=f["det"], mjd=f["mjd"])
                for f in sel if np.isfinite(f["wl"])]
    fr = bin_frames(sel, bin_days)
    stack = np.array([f["image"] for f in fr])
    dstack = stack - np.nanmedian(stack, axis=0)               # minus the average frame
    s_med = (1.4826 * np.nanmedian(np.abs(dstack))) or 1e-9
    disp = dstack if mode == "sub_median" else (stack - stack[0] if mode == "sub_first" else stack)
    diff = mode != "raw"
    if diff:
        s_ = (1.4826 * np.nanmedian(np.abs(disp))) or 1e-9
        lo, hi = -5 * s_, 5 * s_
    else:
        lo, hi = zlimits(disp)
    return dict(n=n, total=len(allf), fr=fr, spectrum=spectrum, disp=disp,
                dstack=dstack, s_med=s_med, lo=lo, hi=hi, diff=diff)


@app.get("/api/frames")
def frames(ra: float, dec: float,
           fov: float = Query(0.2, gt=0.005, le=0.3, description="field of view, deg"),
           scale: float = Query(6.2, ge=1.5, le=6.2, description="output arcsec/pixel"),
           detector: int = Query(0, ge=0, le=6, description="0 = all"),
           bin_days: float = Query(0, ge=0),
           mode: str = Query("raw", pattern="^(raw|sub_median|sub_first)$"),
           max_frames: int = Query(12, ge=6, le=150),
           pmra: float = 0.0, pmdec: float = 0.0, epoch: float = 2026.0, follow: int = 1):
    p = prepare(ra, dec, fov, scale, detector, bin_days, mode, max_frames, pmra, pmdec, epoch, follow)
    return dict(
        n=p["n"], scale=scale, ra=ra, dec=dec, fov=fov, mode=mode, total=p["total"],
        follow=bool(follow), pmra=pmra, pmdec=pmdec, epoch=epoch,
        frames=[dict(png=uri(gray_u8(p["disp"][i], p["lo"], p["hi"], p["diff"])),
                     diff=uri(diverge_rgb(p["dstack"][i], p["s_med"])),
                     mjd=f["mjd"], year=f["year"], cra=f["cra"], cdec=f["cdec"], det=f["det"],
                     wl=f["wl"], flux=f["flux"], err=f["err"], obsid=f["obsid"])
                for i, f in enumerate(p["fr"])],
        spectrum=p["spectrum"])


@app.get("/api/grid")
def grid(ra: float, dec: float,
         fov: float = Query(0.2, gt=0.005, le=0.3),
         scale: float = Query(6.2, ge=1.5, le=6.2),
         pmra: float = 0.0, pmdec: float = 0.0, epoch: float = 2026.0, follow: int = 1):
    """One exposure from each of the 6 detectors = the target in 6 infrared colours."""
    panels, n = [], None
    for d in range(1, 7):
        try:
            n, fl = build_frames_locked(round(ra, 6), round(dec, 6), round(fov, 4),
                                        round(scale, 2), 2, d, round(pmra, 3), round(pmdec, 3),
                                        round(epoch, 2), bool(follow))
        except HTTPException:
            continue
        fl = [f for f in fl if f["det"] == d]
        if fl:
            f = fl[0]
            panels.append(dict(det=d, png=uri(inferno_rgb(f["image"])),
                               wl=float(f["wl"]) if np.isfinite(f["wl"]) else None,
                               mjd=f["mjd"], year=f["year"], cra=f["cra"], cdec=f["cdec"]))
    if not panels:
        raise HTTPException(404, "No exposure with the target inside the image was found.")
    return dict(n=n, scale=scale, ra=ra, dec=dec, fov=fov, pmra=pmra, pmdec=pmdec,
                epoch=epoch, follow=bool(follow), panels=panels)


@app.get("/api/gif")
def gif(ra: float, dec: float,
        fov: float = Query(0.2, gt=0.005, le=0.3),
        scale: float = Query(6.2, ge=1.5, le=6.2),
        detector: int = Query(3, ge=0, le=6),
        bin_days: float = Query(0, ge=0),
        mode: str = Query("raw", pattern="^(raw|sub_median|sub_first)$"),
        max_frames: int = Query(12, ge=6, le=150),
        pmra: float = 0.0, pmdec: float = 0.0, epoch: float = 2026.0, follow: int = 1,
        interval_ms: int = Query(600, ge=100, le=3000)):
    """Animated GIF: image (left) + difference from the average frame (right)."""
    from PIL import ImageDraw
    p = prepare(ra, dec, fov, scale, detector, bin_days, mode, max_frames, pmra, pmdec, epoch, follow)
    size, out = 360, []
    for i, f in enumerate(p["fr"]):
        left = Image.fromarray(gray_u8(p["disp"][i], p["lo"], p["hi"], p["diff"])).convert("RGB")
        right = Image.fromarray(diverge_rgb(p["dstack"][i], p["s_med"]))
        canvas = Image.new("RGB", (size * 2 + 10, size + 28), (13, 17, 23))
        canvas.paste(left.resize((size, size), Image.BICUBIC), (0, 28))
        canvas.paste(right.resize((size, size), Image.BICUBIC), (size + 10, 28))
        d = ImageDraw.Draw(canvas)
        if follow:                                     # object is at the centre: ring it
            for ox in (0, size + 10):
                c = size / 2 + ox
                d.ellipse([c - 24, 28 + size / 2 - 24, c + 24, 28 + size / 2 + 24],
                          outline=(0, 200, 215), width=2)
        date = (time.strftime("%Y-%m-%d", time.gmtime((f["mjd"] - 40587) * 86400))
                if np.isfinite(f["mjd"]) else "?")
        d.text((6, 8), f"frame {i + 1}/{len(p['fr'])}  detector {f['det'] or 'mixed'}  "
                       f"{date}  wavelength ~{f['wl']:.2f} um", fill=(230, 237, 243))
        d.text((size + 16, 8), "difference from average: red = brighter, blue = fainter",
               fill=(139, 148, 158))
        out.append(canvas)
    buf = io.BytesIO()
    out[0].save(buf, format="GIF", save_all=True, append_images=out[1:],
                duration=interval_ms, loop=0)
    return Response(buf.getvalue(), media_type="image/gif",
                    headers={"Content-Disposition": "attachment; filename=spherex_blink.gif"})


def _vizier(catalog, columns, ra, dec, radius_deg, extra=None):
    from astroquery.vizier import Vizier, conf
    errors = []
    for server in ("vizier.cds.unistra.fr", "vizier.cfa.harvard.edu"):
        try:
            conf.server = server
            v = Vizier(columns=columns, row_limit=600, **(extra or {}))
            t = v.query_region(SkyCoord(ra * u.deg, dec * u.deg), radius=radius_deg * u.deg,
                               catalog=catalog)
            return t[0] if len(t) else None
        except Exception as e:  # noqa: BLE001
            errors.append(f"{server}: {str(e)[:160]}")
    log.warning("VizieR failed | %s", " | ".join(errors))
    raise HTTPException(502, "Catalogue server (VizieR) not reachable: " + errors[-1])


def _val(t, col, i):
    return None if np.ma.is_masked(t[col][i]) else float(t[col][i])


@app.get("/api/gaia")
def gaia(ra: float, dec: float, fov: float = 0.05, gmax: float = 19.0):
    """Gaia DR3 stars (epoch 2016.0) with proper motions, via VizieR."""
    t = _vizier("I/355/gaiadr3", ["Source", "RA_ICRS", "DE_ICRS", "pmRA", "pmDE", "Gmag"],
                ra, dec, fov * 0.75, dict(column_filters={"Gmag": f"<{gmax}"}))
    if t is None:
        return []
    return [dict(id=int(t["Source"][i]), ra=_val(t, "RA_ICRS", i), dec=_val(t, "DE_ICRS", i),
                 pmra=_val(t, "pmRA", i) or 0.0, pmdec=_val(t, "pmDE", i) or 0.0,
                 g=_val(t, "Gmag", i)) for i in range(len(t))]


@app.get("/api/wise")
def wise(ra: float, dec: float, fov: float = 0.05):
    """AllWISE sources (epoch 2010.5) with proper motions, via VizieR."""
    t = _vizier("II/328/allwise",
                ["AllWISE", "RAJ2000", "DEJ2000", "W1mag", "W2mag", "pmRA", "pmDE"],
                ra, dec, fov * 0.75 + 0.03)
    if t is None:
        return []
    return [dict(id=str(t["AllWISE"][i]), ra=_val(t, "RAJ2000", i), dec=_val(t, "DEJ2000", i),
                 pmra=_val(t, "pmRA", i) or 0.0, pmdec=_val(t, "pmDE", i) or 0.0,
                 w1=_val(t, "W1mag", i), w2=_val(t, "W2mag", i)) for i in range(len(t))]


@app.get("/api/health")
def health():
    return {"ok": True}


# Optional: exported SPHEREx targets for the 3D map (nebula/targets.json, nebula/<slug>/...)
_HERE = os.path.dirname(os.path.abspath(__file__))
if os.path.isdir(os.path.join(_HERE, "nebula")):
    app.mount("/nebula", StaticFiles(directory=os.path.join(_HERE, "nebula")), name="nebula")

# serve the web page (static/index.html) at http://localhost:8000/
app.mount("/", StaticFiles(directory=os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                   "static"), html=True), name="static")
