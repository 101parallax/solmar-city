#!/usr/bin/env python3
"""Run the entities harness in headless Chromium and grab screenshots.

Serves /tmp/gta6-test (symlinks: game/ + tests/ -> the repo, vendor/ -> the
three.js build for tests only). Usage:
    ~/workspace/playwright-x/.venv/bin/python tests/entities/run-tests.py
Prints the sim results JSON, saves shots to /tmp/gta6-test/shots/.
"""
import json
import os
import subprocess
import sys
import time

REPO = os.path.expanduser("~/workspace/makefun/gta6-01/solmar-city")
ROOT = "/tmp/gta6-test"
PORT = 8901


def main():
    os.makedirs(f"{ROOT}/shots", exist_ok=True)
    for name, target in (("game", f"{REPO}/game"), ("tests", f"{REPO}/tests")):
        link = f"{ROOT}/{name}"
        if not os.path.islink(link):
            os.symlink(target, link)
    server = subprocess.Popen(
        [sys.executable, "-m", "http.server", str(PORT), "--bind", "127.0.0.1"],
        cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        time.sleep(1)
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            browser = p.chromium.launch()
            page = browser.new_page(viewport={"width": 1280, "height": 720})
            page.on("console", lambda m: print(f"[console.{m.type}] {m.text}") if m.type == "error" else None)
            page.on("pageerror", lambda e: print(f"[pageerror] {getattr(e, 'stack', e)}"))
            page.goto(f"http://127.0.0.1:{PORT}/tests/entities/harness.html",
                      wait_until="load", timeout=120000)
            page.wait_for_function("window.__simResults !== undefined", timeout=120000)
            results = page.evaluate("window.__simResults")
            print(json.dumps(results, indent=2))
            for stage in ("chase", "street", "police", "top"):
                page.evaluate(f"window.__stage({json.dumps(stage)})")
                page.wait_for_function("window.__shotReady === true", timeout=30000)
                page.evaluate("window.__shotReady = false")
                page.screenshot(path=f"{ROOT}/shots/{stage}.png")
                print(f"shot: {ROOT}/shots/{stage}.png")
            browser.close()
        failed = [c for c in results.get("checks", []) if not c["pass"]]
        return 1 if failed or results.get("errors") else 0
    finally:
        server.terminate()


if __name__ == "__main__":
    sys.exit(main())
