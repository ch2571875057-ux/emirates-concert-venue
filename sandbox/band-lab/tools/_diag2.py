# -*- coding: utf-8 -*-
"""临时诊断 2：读数渲染器状态、相机、每件可见性、画布取样。"""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request

import websocket

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
URL = sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8152/sandbox/band-lab/index.html?view=front&still=1&ui=0"
EXPR = sys.argv[2] if len(sys.argv) > 2 else ""
HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
PROF = os.path.join(LAB, ".diag_profile")
PORT = 9445


def wait_ws():
    for _ in range(80):
        try:
            with urllib.request.urlopen("http://127.0.0.1:%d/json/list" % PORT, timeout=1) as r:
                for t in json.load(r):
                    if t.get("type") == "page" and t.get("webSocketDebuggerUrl"):
                        return t["webSocketDebuggerUrl"]
        except Exception:
            pass
        time.sleep(0.25)
    return None


def main():
    shutil.rmtree(PROF, ignore_errors=True)
    os.makedirs(PROF, exist_ok=True)
    proc = subprocess.Popen([
        EDGE, "--headless=new", "--use-angle=swiftshader", "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1",
        "--window-size=1600,1000", "--remote-allow-origins=*",
        "--remote-debugging-port=%d" % PORT,
        "--user-data-dir=" + PROF, "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--disable-sync", URL,
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    try:
        ws_url = wait_ws()
        if not ws_url:
            print("no devtools")
            return 1
        ws = websocket.create_connection(ws_url, timeout=30)
        time.sleep(9)
        mid = [0]

        def call(method, params=None, wait=True):
            mid[0] += 1
            i = mid[0]
            ws.send(json.dumps({"id": i, "method": method, "params": params or {}}))
            if not wait:
                return None
            t0 = time.time()
            while time.time() - t0 < 12:
                try:
                    ws.settimeout(1.0)
                    msg = json.loads(ws.recv())
                except Exception:
                    continue
                if msg.get("id") == i:
                    return msg
            return None

        r = call("Runtime.evaluate", {"expression": EXPR, "returnByValue": True, "awaitPromise": True})
        if r and "result" in r:
            val = r["result"].get("result", {}).get("value")
            print(val if isinstance(val, str) else json.dumps(val, ensure_ascii=False))
        else:
            print("no result", json.dumps(r)[:500] if r else "")
        ws.close()
    finally:
        proc.terminate()
        try:
            proc.wait(10)
        except Exception:
            proc.kill()
        shutil.rmtree(PROF, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
