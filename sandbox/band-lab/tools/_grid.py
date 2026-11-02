# -*- coding: utf-8 -*-
"""把截图切成 cols x rows 网格，打印每格平均亮度（数值），用于无图像输入时定位亮块。

用法： python tools/_grid.py shots/focus_crowd_a.png [cols] [rows]
"""
import sys

import numpy as np
from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

path = sys.argv[1]
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 20
rows = int(sys.argv[3]) if len(sys.argv) > 3 else 12

a = np.asarray(Image.open(path).convert('RGB')).astype(np.float32)
lum = a.mean(axis=2)
h, w = lum.shape
print('%s  %dx%d  mean=%.1f' % (path, w, h, lum.mean()))
print('     ' + ''.join('%5d' % int((i + 0.5) * w / cols) for i in range(cols)))
for r in range(rows):
    y0, y1 = int(r * h / rows), int((r + 1) * h / rows)
    line = ''
    for c in range(cols):
        x0, x1 = int(c * w / cols), int((c + 1) * w / cols)
        line += '%5.0f' % lum[y0:y1, x0:x1].mean()
    print('%4d %s' % (y0, line))
