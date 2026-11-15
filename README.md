# SPHEREx Blink
pip install -r requirements.txt
uvicorn app:app --reload   # http://localhost:8000
URL params: ?ra=133.795129&dec=-7.245147&fov=0.05&detector=0&bin_days=0&mode=raw&gaia=1
Env: SPHEREX_COLLECTION (default spherex_qr2), SPHEREX_CACHE (default ./cache)
Verify before trusting science: CUTOUT_TEMPLATE and BAD_BITS in app.py.