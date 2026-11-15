"""Preload the test targets so a demo is instant. Run while the server is running:
   python3 warm.py
"""
import requests
B = "http://127.0.0.1:8000"
for name in ["Barnard's Star", "eps Ind Ba", "WISE J085510.83-071442.5", "RW Aur", "R Dra"]:
    try:
        c = requests.get(B + "/api/resolve", params={"name": name}, timeout=60).json()
        print(f"{name}: loading frames (this can take a few minutes)...", flush=True)
        r = requests.get(B + "/api/frames", params=dict(
            ra=c["ra"], dec=c["dec"], fov=0.05, detector=3, max_frames=36,
            pmra=c["pmra"], pmdec=c["pmdec"], epoch=c["epoch"]), timeout=3600)
        print("   ", "ok" if r.ok else f"failed: {r.text[:120]}", flush=True)
    except Exception as e:
        print(f"{name}: skipped ({e})", flush=True)
