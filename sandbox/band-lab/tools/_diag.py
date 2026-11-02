# -*- coding: utf-8 -*-
"""临时诊断：用 CDP 抓沙盒页的 console / exception，定位白屏原因。"""
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
HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
PROF = os.path.join(LAB, ".diag_profile")
PORT = 9444


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
        ws = websocket.create_connection(ws_url, timeout=20)
        mid = [0]

        def send(method, params=None):
            mid[0] += 1
            ws.send(json.dumps({"id": mid[0], "method": method, "params": params or {}}))
            return mid[0]

        send("Runtime.enable")
        send("Log.enable")
        deadline = time.time() + 22
        while time.time() < deadline:
            try:
                ws.settimeout(1.0)
                msg = json.loads(ws.recv())
            except Exception:
                continue
            m = msg.get("method")
            if m == "Runtime.consoleAPICalled":
                parts = []
                for a in msg["params"].get("args", []):
                    v = a.get("value")
                    parts.append(str(v) if v is not None else a.get("description", ""))
                print("[console] %s: %s" % (msg["params"].get("type"), " ".join(parts)[:400]))
            elif m == "Runtime.exceptionThrown":
                d = msg["params"]["exceptionDetails"]
                txt = d.get("exception", {}).get("description") or d.get("text")
                print("[exception] %s" % (txt or "")[:600])
            elif m == "Log.entryAdded":
                e = msg["params"]["entry"]
                print("[log:%s] %s" % (e.get("level"), (e.get("text") or "")[:300]))
        # 探一下页面状态
        i = send("Runtime.evaluate", {"expression":
                 "JSON.stringify({ready:document.body.dataset.ready||'',items:(window.__bandLab||{}).items?Object.keys(window.__bandLab.items):[],"
                 "stats:(window.__bandLab||{}).stats||{}, canvas:!!document.querySelector('canvas'),"
                 "pw:document.querySelector('canvas')?document.querySelector('canvas').width:0})",
                 "returnByValue": True})
        t0 = time.time()
        while time.time() - t0 < 5:
            try:
                ws.settimeout(1.0)
                msg = json.loads(ws.recv())
            except Exception:
                continue
            if msg.get("id") == i:
                print("[state] %s" % msg["result"]["result"].get("value"))
                break
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
