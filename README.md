# Infrapix: Solar System Explorer + SPHEREx Blink

An interactive 3D map of the Solar System and SPHEREx deep-sky targets, with a built-in **Blink view**:
every SPHEREx exposure of any spot on the sky, lined up and flipped like a movie, so moving objects jump out.

## Run
```
pip install -r requirements.txt
SPHEREX_WORKERS=1 uvicorn app:app
```
Open http://localhost:8000 for the website, and http://localhost:8000/explorer.html for the 3D explorer (needs internet: Three.js and fonts load from CDNs, images come from NASA IRSA).

## Using the Blink view
- Search any name in the top bar that is not on the map, e.g. *Barnard's Star*, and choose **Blink**.
- Or select a deep-sky target on the map and press **Blink these SPHEREx exposures** in its card.
- Or press the blink button on the time bar and type a name, or `RA, Dec` in degrees.
- Space plays/pauses, ← → step frames, Esc closes. **Copy link** shares the exact view.

## Overlays and data sources
- **Gaia DR3** (ESA Gaia archive), **AllWISE** and **CatWISE2020** (NASA/IPAC IRSA), each moved to the frame's date using its proper motion.
- **Known asteroids and comets** (SkyBoT, IMCCE): where every catalogued solar-system object should be on each frame's date. A mover with no marker is not a known object.
- Proper motion for any name comes from SIMBAD, or from Gaia/CatWISE when SIMBAD is unreachable.
- Open `/api/diag` to see which outside services your network can reach.

## Files
- `app.py` – backend (IRSA cutouts, proper motion, difference frames, overlays) and static file server
- `static/index.html` – the Infrapix website (splash, blink tool, challenge, how it works, team)
- `static/explorer.html`, `css/`, `js/` – the 3D Solar System Explorer; `js/blink.js` + `css/blink.css` are its Blink view
- `static/blink.html` – standalone full-screen blink page
- `nebula/` (optional, next to `app.py`) – targets exported by `spherex_scene.py`; shown on the map automatically


## Page layout (v2)
One page: splash -> the 3D explorer (embedded) -> challenge / how it works / team.
Search an object in the explorer: the backend (`/api/fetch`, `/api/status`, `exporter.py`) downloads
its SPHEREx exposures and writes `nebula/<slug>/` (colour composite + six detector images).
It is added to the map; its card shows the pictures and a **Blink** button opens the blink view.
Run `python warm.py` once to pre-fetch the five test targets. `nebula/` is created automatically.
