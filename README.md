# Infrapix: SPHEREx Blink

A public web tool for spotting moving objects in real NASA SPHEREx images. Give it an object name or coordinates and it shows a blink comparator: the same patch of sky on different dates, aligned and flipped through in sequence, so anything that moves or changes brightness stands out.

Built by Team Infrapix for the NASA International Space Apps Challenge ("Planet X and SPHEREx").

## What it does

- Looks up any object by name (SIMBAD / Sesame) and finds its position and proper motion.
- Searches NASA/IPAC IRSA for every SPHEREx exposure covering that position and downloads small cutouts.
- Aligns all frames onto one north-up grid and plays them as a blink.
- Shows a difference view (red = brighter than the average frame, blue = fainter) so movers appear as a red spot next to a blue one.
- Draws the expected path of the object from its proper motion and says how far it should move.
- Shows the target in all six detector colours (0.75 to 5 µm).
- Optional Gaia DR3 and AllWISE overlays, GIF export, and shareable links.

## Run it

You need Python 3.10 or newer.

```
git clone https://github.com/Vic12345678-d/infrapix-spherex.git
cd infrapix-spherex
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
SPHEREX_WORKERS=1 uvicorn app:app
```

Then open http://127.0.0.1:8000 and click through the splash screen. The first load of an object can take several minutes while the cutouts download from IRSA. Later loads use the local cache.

## Files

| File | What it is |
| --- | --- |
| `app.py` | FastAPI backend: name lookup, IRSA search, cutouts, alignment, images |
| `static/index.html` | The Infrapix site with the blink tool built in |
| `static/blink.html` | The standalone full-screen version of the tool |
| `warm.py` | Pre-downloads the test targets so a demo is fast |
| `requirements.txt` | Python packages |

## Settings

- `SPHEREX_WORKERS` is the number of parallel downloads (default 2). Use `1` if IRSA keeps answering "busy (503)".
- `SPHEREX_CACHE` is the cache folder (default `./cache`).

## Link parameters

You can open a view directly with a link, for example:

```
http://127.0.0.1:8000/?name=Barnard%27s+Star
http://127.0.0.1:8000/?ra=133.795129&dec=-7.245147&fov=0.2&detector=3
```

## Test targets

Barnard's Star, Epsilon Indi B, WISE 0855, RW Aurigae, R Draconis.

## Known limits

- IRSA is sometimes busy and answers 503. The tool waits and retries.
- If SIMBAD or VizieR is unreachable, proper motion lookup and the Gaia/AllWISE overlays can fail. Barnard's Star and WISE 0855 have built-in positions and proper motions, so they always work.
- Check the flag settings and cutout address in `app.py` (`BAD_BITS`, `CUTOUT_TEMPLATE`) before trusting the science.

## Team

Saul Chen, Vicente Gonzalez, Allison Ren, Emma Dojc, Marcelo Villegas.

## Data

Images come from the SPHEREx mission, served by NASA/IPAC Infrared Science Archive (IRSA). Star catalogues come from Gaia DR3 and AllWISE via VizieR.