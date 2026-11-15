"""Pre-fetch the five test targets so they are instant on demo day.
Run the server first (SPHEREX_WORKERS=1 uvicorn app:app), then: python warm.py"""
import sys, time, requests
BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000"
for name in ["Barnard's Star", "eps Ind Ba", "WISE J085510.83-071442.5", "RW Aur", "R Dra"]:
    print(name, end=" ... ", flush=True)
    s = requests.get(f"{BASE}/api/fetch", params=dict(name=name), timeout=60).json()
    while s["state"] in ("queued", "running"):
        time.sleep(3)
        s = requests.get(f"{BASE}/api/status", params=dict(name=name), timeout=60).json()
    print(s["state"], s.get("error") or "")
