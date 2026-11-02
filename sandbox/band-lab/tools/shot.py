"""用 Edge 的 --screenshot 模式给沙盒页拍多机位截图。

CDP 长连接在 swiftshader 下反复导航会把 GPU 进程拖崩（ConnectionAbortedError），
改为「一个机位一个 Edge 进程、进程内自截图」，稳得多。

用法：
    python tools/shot.py                 # 拍全部机位
    python tools/shot.py --only front45  # 只拍一个
"""
import argparse
import os
import shutil
import subprocess
import sys
import time

from PIL import Image
import numpy as np

EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
BASE = "http://127.0.0.1:8152/sandbox/band-lab/index.html"
HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
OUT = os.path.join(LAB, "shots")
W, H = 1600, 1000
BUDGET = "16000"

SHOTS = [
    ("front",   "?view=front&still=1&ui=0"),
    ("front45", "?view=front45&still=1&ui=0"),
    ("top",     "?view=top&still=1&ui=0"),
    ("left",    "?view=left&still=1&ui=0"),
    ("right",   "?view=right&still=1&ui=0"),
    ("back",    "?view=back&still=1&ui=0"),
    ("focus_drums", "?focus=drums&still=1&ui=0"),
    ("focus_keys",  "?focus=keys&still=1&ui=0"),
    ("focus_amp",   "?focus=amp&still=1&ui=0"),
    ("focus_p_guitar", "?focus=p_guitar&still=1&ui=0"),
    ("focus_p_bass",   "?focus=p_bass&still=1&ui=0"),
    ("focus_p_drums",  "?focus=p_drums&still=1&ui=0"),
    ("focus_p_keys",   "?focus=p_keys&still=1&ui=0"),
    ("solid",   "?view=front45&mode=solid&still=1&ui=0"),
    ("wire",    "?focus=drums&mode=wire&still=1&ui=0"),
    ("ui",      "?view=front45&still=1"),
]


def shoot(name, qs, budget=BUDGET, tries=2):
    prof = os.path.join(LAB, ".tmp_shot_profile")
    shutil.rmtree(prof, ignore_errors=True)
    os.makedirs(prof, exist_ok=True)
    path = os.path.join(OUT, f"{name}.png")
    if os.path.exists(path):
        os.remove(path)
    cmd = [
        EDGE,
        "--headless=new",
        "--use-angle=swiftshader",
        "--enable-unsafe-swiftshader",
        "--disable-gpu-sandbox",
        "--hide-scrollbars",
        "--force-device-scale-factor=1",
        f"--window-size={W},{H}",
        f"--virtual-time-budget={budget}",
        f"--user-data-dir={prof}",
        "--no-first-run", "--no-default-browser-check",
        "--disable-extensions", "--disable-sync",
        f"--screenshot={path}",
        BASE + qs,
    ]
    for attempt in range(tries):
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=180)
        if not os.path.exists(path):
            continue
        a = np.asarray(Image.open(path).convert("RGB")).astype(np.float32)
        lum = a.mean(axis=2)
        if (lum > 26).mean() > 0.02:
            shutil.rmtree(prof, ignore_errors=True)
            return path, float(lum.mean()), float((lum > 26).mean())
        time.sleep(0.5)
    shutil.rmtree(prof, ignore_errors=True)
    return (path if os.path.exists(path) else None), None, None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", default=None)
    args = ap.parse_args()
    os.makedirs(OUT, exist_ok=True)

    todo = [s for s in SHOTS if args.only is None or s[0] == args.only]
    rc = 0
    for name, qs in todo:
        path, lum, cover = shoot(name, qs)
        if not path:
            print(f"{name:16s} 失败：没有产出文件")
            rc = 1
            continue
        size = os.path.getsize(path)
        if lum is None:
            print(f"{name:16s} 产出但过暗 {size // 1024:5d}KB")
            rc = 1
        else:
            print(f"{name:16s} OK {size // 1024:5d}KB  lum={lum:5.2f} cover={cover * 100:5.2f}%")
    return rc


if __name__ == "__main__":
    sys.exit(main())
