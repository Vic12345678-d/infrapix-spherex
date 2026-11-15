"""Export one object as SPHEREx pictures for the 3D map:
nebula/<slug>/{layer_D1..6.png, composite.png, scene.json} and nebula/targets.json.
Same file layout the team's spherex_scene.py writes, so the 3D map reads it unchanged."""
import json, os, re, threading
from urllib.parse import quote

import numpy as np
import requests
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
NEB = os.path.join(HERE, "nebula")
_idx_lock = threading.Lock()

DET_HEX = {1: "#6aa9ff", 2: "#5fd4c8", 3: "#8ee27a", 4: "#f2d95c", 5: "#ff9f5a", 6: "#ff6b6b"}
BAND_NOTES = {
    1: "Shortest wavelengths: light straight from hot stellar surfaces.",
    2: "Near-infrared: stars with little dust in the way.",
    3: "Near-infrared: cool giants and reddened stars; water-ice absorption starts here.",
    4: "Mid-infrared: warm dust and ices begin to glow.",
    5: "Mid-infrared: dusty, embedded young stars stand out.",
    6: "Longest wavelengths: the warmest dust and gas.",
}
BAND = {1: [0.75, 1.09], 2: [1.10, 1.62], 3: [1.63, 2.41], 4: [2.42, 3.82], 5: [3.83, 4.41], 6: [4.42, 5.00]}

OTYPES = {
    "Galaxies": {"G": "Galaxy", "GiG": "Galaxy in a group", "GiC": "Galaxy in a cluster", "AGN": "Galaxy with an active nucleus",
                 "Sy1": "Seyfert 1 galaxy", "Sy2": "Seyfert 2 galaxy", "SyG": "Seyfert galaxy", "QSO": "Quasar",
                 "SBG": "Starburst galaxy", "IG": "Interacting galaxies", "ClG": "Cluster of galaxies", "LIN": "LINER galaxy"},
    "Nebulae": {"HII": "Emission nebula (HII region)", "RNe": "Reflection nebula", "DNe": "Dark nebula", "GNe": "Nebula",
                "PN": "Planetary nebula", "SNR": "Supernova remnant", "MoC": "Molecular cloud", "SFR": "Star-forming region"},
    "Star clusters": {"Cl*": "Star cluster", "GlC": "Globular cluster", "OpC": "Open cluster", "As*": "Stellar association"},
}
CAT = {c: k for k, v in OTYPES.items() for c in v}
LAB = {c: l for v in OTYPES.values() for c, l in v.items()}
LY_PER_PC, H0 = 3.26156, 70.0


def slug_of(label):
    return re.sub(r"[^a-z0-9]+", "_", label.lower()).strip("_") or "target"


def _sesame_xml(name):
    try:
        return requests.get("https://cds.unistra.fr/cgi-bin/nph-sesame/-oxpI/S?" + quote(name), timeout=25).text
    except Exception:  # noqa: BLE001
        return ""


def classify_and_distance(name):
    x = _sesame_xml(name)
    m = re.search(r"<otype>([^<]+)</otype>", x)
    ot = m.group(1).strip() if m else None
    if ot in CAT:
        info = dict(otype=ot, type_label=LAB[ot], category=CAT[ot])
    elif ot and "*" in ot:
        info = dict(otype=ot, type_label="Star", category="Stars")
    else:
        info = dict(otype=ot, type_label=None, category="Other")
    dist = None
    plx = re.search(r"<plx>\s*<v>([\d.]+)</v>", x)
    vel = re.search(r"<Vel>\s*<v>(-?[\d.]+)</v>", x)
    if plx and float(plx.group(1)) > 0.2:
        dist = dict(ly=1000 / float(plx.group(1)) * LY_PER_PC, method="parallax",
                    note="from its parallax (how much it shifts as Earth orbits the Sun)")
    elif info["category"] == "Galaxies" and vel and float(vel.group(1)) > 300:
        v = float(vel.group(1))
        dist = dict(ly=v / H0 * 1e6 * LY_PER_PC, method="redshift",
                    note=f"estimated from its redshift ({v:,.0f} km/s) with Hubble's law")
    return info, dist


def stretch(a):
    """Dark sky, bright stars: black a little above the sky level (hides the noise),
    white at the 99.7th percentile, asinh in between."""
    import app as A
    a = A.fill_small_holes(a)
    v = a[np.isfinite(a)]
    if v.size < 10:
        return np.zeros_like(a)
    med = float(np.median(v))
    sig = float(1.4826 * np.median(np.abs(v - med))) or 1e-9
    lo, hi = med + 0.3 * sig, max(float(np.percentile(v, 99.7)), med + 10 * sig)
    x = np.clip((a - lo) / (hi - lo), 0, 1)
    x = np.arcsinh(12 * x) / np.arcsinh(12)
    return np.nan_to_num(x, nan=0.0)


def inferno(x):
    """0..1 -> RGB with the 'inferno' colours the team's original six-panel figure used."""
    cols = [(0, 0, 4), (40, 11, 84), (101, 21, 110), (159, 42, 99), (212, 72, 66), (245, 125, 21), (250, 193, 39), (252, 255, 164)]
    xs = np.linspace(0, 1, len(cols))
    return np.stack([np.interp(x, xs, [c[i] / 255 for c in cols]) for i in range(3)], -1)


UPSCALE = 4      # PNGs are saved 4x larger with Lanczos so the 3D map shows them smoothly


def save_png(arr01, path, mode):
    im = Image.fromarray((np.flipud(np.clip(arr01, 0, 1)) * 255).round().astype(np.uint8), mode)
    im.resize((im.width * UPSCALE, im.height * UPSCALE), Image.LANCZOS).save(path, optimize=True)


def box_blur(a, r):
    p = np.pad(a, r + 1, mode="edge")
    c = p.cumsum(0).cumsum(1)
    k = 2 * r + 1
    s = c[k:, k:] - c[:-k, k:] - c[k:, :-k] + c[:-k, :-k]
    return s[:a.shape[0], :a.shape[1]] / (k * k)


def find_sources(rgb, max_n=120, min_sep=3.0):
    L = rgb.max(axis=2)
    ny, nx = L.shape
    contrast = L - box_blur(L, 6)
    cand = np.argwhere((contrast > 0.10) & (L > 0.30))
    order = np.argsort(-(contrast[cand[:, 0], cand[:, 1]] + 0.3 * L[cand[:, 0], cand[:, 1]]))
    kept = []
    for j, i in cand[order]:
        if 1 <= i < nx - 1 and 1 <= j < ny - 1 and all((i - a) ** 2 + (j - b) ** 2 >= min_sep ** 2 for b, a in kept):
            kept.append((j, i))
            if len(kept) >= max_n:
                break
    return kept


def kind_of(c):
    r, g, b = c
    if r > 1.25 * b and r >= g:
        return "dusty", "Brightest at 3.8-5 um: a cool, dusty source, perhaps a young star still in its birth cloud, or a reddened background star."
    if b > 1.25 * r and b >= g:
        return "hot", "Brightest at short wavelengths: light from a star's hot surface, with little dust in the way."
    if g > 1.2 * max(r, b):
        return "mid", "Brightest at 1.6-3.8 um: often a cool giant star, or a star seen through some dust."
    return "flat", "About equally bright across 0.75-5 um: a bright star, or a spot of glowing gas and dust."


def export_target(name, say, fov=0.25):
    """say(step, text) reports progress. Returns the slug."""
    import app as A
    say("resolve", f"Looking up {name}")
    r = A.resolve(name)
    ra, dec, pmra, pmdec, epoch = r["ra"], r["dec"], r["pmra"], r["pmdec"], r["epoch"]
    say("search", "Finding SPHEREx exposures")
    scale = 6.2
    imgs = {}
    for d in range(1, 7):
        say("download", f"Downloading detector {d} of 6")
        A._prog(outer=(d - 1, 6), stage="search", done=0, total=0)
        try:
            n, fl = A.build_frames_locked(round(ra, 6), round(dec, 6), fov, scale, 1, d,
                                          round(pmra, 3), round(pmdec, 3), round(epoch, 2), True)
        except Exception as e:  # noqa: BLE001
            A.log.info("detector %d: %s", d, e)
            continue
        fl = [f for f in fl if f["det"] == d]
        if fl:
            f = max(fl, key=lambda f: np.isfinite(f["image"]).sum())
            imgs[d] = f
    if not imgs:
        raise RuntimeError("No SPHEREx exposure covers this position (or IRSA is throttling; wait a minute and retry).")
    A._prog(outer=None, stage="done")
    say("export", "Making the pictures")
    slug = slug_of(name)
    out = os.path.join(NEB, slug)
    os.makedirs(out, exist_ok=True)
    layers = {d: stretch(f["image"]) for d, f in imgs.items()}
    for d, s in layers.items():
        save_png(inferno(s), os.path.join(out, f"layer_D{d}.png"), "RGB")
    z = np.zeros_like(next(iter(layers.values())))
    g = lambda *ds: np.mean([layers[d] for d in ds if d in layers], axis=0) if any(d in layers for d in ds) else z
    rgb = np.stack([g(5, 6), g(3, 4), g(1, 2)], axis=-1)
    save_png(rgb, os.path.join(out, "composite.png"), "RGB")
    ny, nx = rgb.shape[:2]
    from datetime import datetime, timedelta
    meta = []
    for d, f in sorted(imgs.items()):
        wl = f["wl"]
        try:
            date = (datetime(1858, 11, 17) + timedelta(days=f["mjd"])).strftime("%Y-%m-%d")
        except Exception:  # noqa: BLE001
            date = None
        meta.append(dict(det=d, wl=[round(float(wl) - 0.02, 3), round(float(wl) + 0.02, 3)] if np.isfinite(wl) else None,
                         band=BAND[d], date=date, color=DET_HEX[d], note=BAND_NOTES[d], features=[], file=f"layer_D{d}.png"))
    wcs = A.target_wcs(ra, dec, nx, scale)
    sources = []
    for j, i in find_sources(rgb):
        bands = [round(float(layers[d][j, i]), 3) if d in layers else 0 for d in range(1, 7)]
        if len(layers) >= 3 and sum(b > 0.15 for b in bands) < 2:
            continue
        c = rgb[j, i]
        k, why = kind_of(c)
        sky = wcs.pixel_to_world(i, j)
        sources.append(dict(id=len(sources) + 1, col=int(i), row=int(ny - 1 - j), rgb=[round(float(v), 3) for v in c],
                            peak=round(float(rgb[j, i].max()), 3), bands=bands,
                            ra=round(float(sky.ra.deg), 5), dec=round(float(sky.dec.deg), 5), kind=k, why=why))
    info, dist = classify_and_distance(name)
    scene = dict(name=name, slug=slug, ra=round(ra, 5), dec=round(dec, 5), size_deg=fov, pix_arcsec=scale, n=int(nx),
                 field_arcmin=round(fov * 60, 1), composite="composite.png",
                 rgb_bands=dict(blue=[0.75, 1.6], green=[1.6, 3.8], red=[3.8, 5.0]), layers=meta, sources=sources,
                 landmarks=[], from_coords=False, pmra=pmra, pmdec=pmdec, distance=dist, **info)
    with open(os.path.join(out, "scene.json"), "w", encoding="utf-8") as fh:
        json.dump(scene, fh, indent=1)
    with _idx_lock:
        p = os.path.join(NEB, "targets.json")
        try:
            t = json.load(open(p, encoding="utf-8"))
        except (OSError, ValueError):
            t = []
        if not any(x["slug"] == slug for x in t):
            t.append(dict(slug=slug, name=name))
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(t, fh, indent=1)
    return slug
