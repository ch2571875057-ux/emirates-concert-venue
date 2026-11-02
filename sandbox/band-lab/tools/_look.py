# -*- coding: utf-8 -*-
"""把截图转成 ASCII 亮度图（当前模型无图像输入时用来粗判画面）。

用法： python tools/_look.py shots/front.png [更多图片...]
"""
import os
import sys

import numpy as np
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

CH = ' .:-=+*#%@'


def show(path):
    a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
    lum = a.mean(axis=2)
    h, w = lum.shape
    print('== %s  %dx%d  mean=%.1f p50=%.1f p90=%.1f p99=%.1f max=%.1f'
          % (os.path.basename(path), w, h, lum.mean(),
             np.percentile(lum, 50), np.percentile(lum, 90),
             np.percentile(lum, 99), lum.max()))
    step_y, step_x = max(1, h // 28), max(1, w // 56)
    for y in range(0, h - step_y + 1, step_y):
        row = ''.join(CH[min(9, int(lum[y:y + step_y, x:x + step_x].mean() / 8))]
                      for x in range(0, w - step_x + 1, step_x))
        print('%4d %s' % (y, row))
    # 主色 top8
    q = (a.reshape(-1, 3) // 32).astype(np.int32)
    keys = q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]
    uniq, cnt = np.unique(keys, return_counts=True)
    order = np.argsort(-cnt)[:8]
    print('主色: ', '  '.join('#%02x%02x%02x %.1f%%'
                             % ((k // 64) * 32 + 16, ((k // 8) % 8) * 32 + 16,
                                (k % 8) * 32 + 16, c / len(keys) * 100)
                             for k, c in zip(uniq[order], cnt[order])))
    print()


if __name__ == '__main__':
    for p in sys.argv[1:]:
        show(p)
