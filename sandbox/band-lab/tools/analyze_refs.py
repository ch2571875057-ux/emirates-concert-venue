# -*- coding: utf-8 -*-
"""
analyze_refs.py — 程序化解析参考图（本会话无法目视看图，只能量化）

对 refs/*.png 做：
  1. 背景估计（四角平均色）→ 去背得到主体掩码
  2. 主体包围盒 / 长宽比 / 落地点
  3. 主色聚类（k-means，k=6）+ 每色占比
  4. 按行/列的宽度剖面，估计关键结构高度（如鼓的高度分布、琴体/琴颈比例）
输出 refs/_analysis.json + 控制台摘要。
"""
import glob
import io
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
REFS = os.path.join(ROOT, 'refs')


def kmeans(px, k=6, iters=24, seed=0):
    rng = np.random.default_rng(seed)
    idx = rng.choice(len(px), min(k, len(px)), replace=False)
    c = px[idx].astype(np.float64)
    for _ in range(iters):
        d = ((px[:, None, :] - c[None, :, :]) ** 2).sum(-1)
        lab = d.argmin(1)
        for i in range(len(c)):
            m = lab == i
            if m.any():
                c[i] = px[m].mean(0)
    d = ((px[:, None, :] - c[None, :, :]) ** 2).sum(-1)
    lab = d.argmin(1)
    counts = np.bincount(lab, minlength=len(c))
    order = np.argsort(-counts)
    return [(c[i], counts[i] / len(px)) for i in order]


def analyze(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(np.int16)
    H, W, _ = a.shape
    corners = np.array([a[0, 0], a[0, -1], a[-1, 0], a[-1, -1]], float)
    bg = corners.mean(0)
    dist = np.abs(a - bg[None, None, :]).sum(-1)
    mask = dist > 42                       # 与背景差异阈值
    # 去掉零星噪声：只保留最大连通域
    from collections import deque
    seen = np.zeros_like(mask, dtype=bool)
    best, best_n = None, 0
    ys, xs = np.nonzero(mask)
    for y0, x0 in zip(ys[::37], xs[::37]):
        if seen[y0, x0] or not mask[y0, x0]:
            continue
        q = deque([(y0, x0)])
        seen[y0, x0] = True
        comp = []
        while q:
            y, x = q.popleft()
            comp.append((y, x))
            for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and mask[yy, xx] and not seen[yy, xx]:
                    seen[yy, xx] = True
                    q.append((yy, xx))
        if len(comp) > best_n:
            best_n, best = len(comp), comp
    main = np.zeros_like(mask)
    for y, x in best:
        main[y, x] = True
    ys, xs = np.nonzero(main)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    bw, bh = x1 - x0 + 1, y1 - y0 + 1

    # 逐行宽度剖面（从上到下，归一化到 0..1）
    prof = []
    for t in range(24):
        yy = int(y0 + (y1 - y0) * t / 23)
        row = np.nonzero(main[yy])[0]
        w = (len(row) and (row.max() - row.min() + 1)) or 0
        prof.append(round(w / bw, 3))

    # 主色
    px = a[main]
    step = max(1, len(px) // 20000)
    cols = kmeans(px[::step].astype(np.float64), k=6)

    return {
        'file': os.path.basename(path),
        'pixels': [W, H],
        'bg': [int(v) for v in bg],
        'bbox': [int(x0), int(y0), int(bw), int(bh)],
        'aspect_h_over_w': round(bh / bw, 3),
        'fill_ratio': round(main.sum() / (bw * bh), 3),
        'width_profile_topdown': prof,
        'colors': [{'rgb': [int(v) for v in c], 'hex': '#%02x%02x%02x' % tuple(int(v) for v in c),
                    'share': round(s, 3)} for c, s in cols],
        '_mask': main,
    }


def main():
    out = {}
    for p in sorted(glob.glob(os.path.join(REFS, '*.png'))):
        name = os.path.splitext(os.path.basename(p))[0]
        info = analyze(p)
        out[name] = info
        print('\n=== %s  %dx%d  bbox=%s  h/w=%.2f  fill=%.2f' % (
            info['file'], info['pixels'][0], info['pixels'][1],
            info['bbox'], info['aspect_h_over_w'], info['fill_ratio']))
        print('  宽度剖面(上→下):', ' '.join('%.2f' % v for v in info['width_profile_topdown']))
        print('  主色:', '  '.join('%s %.0f%%' % (c['hex'], c['share'] * 100) for c in info['colors']))
        info.pop('_mask')
    with io.open(os.path.join(REFS, '_analysis.json'), 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)
    print('\nwritten refs/_analysis.json')


if __name__ == '__main__':
    main()
