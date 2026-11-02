# -*- coding: utf-8 -*-
"""
qa_shots.py — 对沙盒页 headless 截图做客观检查

不能替代人眼判断造型，但能挡住明显事故：
  1. 全黑 / 几乎全黑（页面没渲染出东西）
  2. 主体占比过小（模型没加载、相机飞了）
  3. 画面几乎纯色（HUD 以外的区域没有内容）
  4. 与同组平均亮度差异过大（某机位异常）

用法： python tools/qa_shots.py [shots 目录]
"""
import glob
import os
import sys

from PIL import Image
import numpy as np

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
SHOTS = sys.argv[1] if len(sys.argv) > 1 else os.path.join(LAB, 'shots')


def stats(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = a.mean(axis=2)
    # 深色底（0x070b14 夜景）判定亮部：lum > 26 视为有内容
    mask = lum > 26
    frac = float(mask.mean())
    body = float(lum[mask].mean()) if mask.any() else 0.0
    if mask.any():
        ys, xs = np.nonzero(mask)
        h, w = lum.shape
        pad = (xs.min() / w, 1 - xs.max() / w, ys.min() / h, 1 - ys.max() / h)
    else:
        pad = (0, 0, 0, 0)
    q = (a[mask] // 32).astype(np.int32) if mask.any() else np.zeros((0, 3), np.int32)
    colors = len(np.unique(q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2])) if len(q) else 0
    return dict(lum=float(lum.mean()), frac=frac, body=body, pad=pad, colors=colors)


def main():
    files = sorted(glob.glob(os.path.join(SHOTS, '*.png')))
    if not files:
        print('没有截图：', SHOTS)
        return 2

    print('%-16s %-11s %7s %7s %7s %6s  %s'
          % ('file', 'size', 'lum', 'cover%', 'body', 'colors', 'verdict'))
    rows = []
    bad = []
    for f in files:
        im = Image.open(f)
        s = stats(f)
        name = os.path.basename(f)
        notes = []
        # wire / solid 是渲染模式诊断图：线框本来就是单色细线，不能按「纯色」判错
        mode_shot = name.startswith(('wire', 'solid'))
        if s['lum'] < 4:
            notes.append('全黑')
        if s['frac'] < 0.02:
            notes.append('内容过少')
        if s['colors'] < 3 and not mode_shot and s['frac'] > 0.06:
            notes.append('几乎纯色')
        # 特写机位本来就要占满画面，只在非特写且几乎满屏时才怀疑出画
        if s['frac'] > 0.9 and any(p < 0.002 for p in s['pad']):
            notes.append('几乎满屏，可能出画')
        if notes:
            bad.append((name, notes))
        rows.append((name, s))
        print('%-16s %-11s %7.2f %7.2f %7.2f %6d  %s'
              % (name, '%dx%d' % im.size, s['lum'], s['frac'] * 100,
                 s['body'], s['colors'], ' '.join(notes) if notes else 'ok'))

    print()
    lums = [r[1]['lum'] for r in rows]
    print('亮度范围 %.2f .. %.2f，中位 %.2f'
          % (min(lums), max(lums), float(np.median(lums))))
    if bad:
        print('需关注 %d 张：' % len(bad))
        for name, notes in bad:
            print('  - %-16s %s' % (name, ' '.join(notes)))
        return 1
    print('截图客观检查通过：无全黑、无空帧、无纯色、无明显出画。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
