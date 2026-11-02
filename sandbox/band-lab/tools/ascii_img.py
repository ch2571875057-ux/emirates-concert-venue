"""把渲染图压成 ASCII 亮度图，便于在没有图像输入能力时判断画面结构。

用法： python tools/ascii_img.py render/guitar_p1.png [cols]
"""
import sys
from PIL import Image
import numpy as np

path = sys.argv[1]
cols = int(sys.argv[2]) if len(sys.argv) > 2 else 56
img = Image.open(path).convert('RGB')
a = np.asarray(img).astype(np.float32)
h, w = a.shape[:2]
rows = max(1, int(round(cols * h / float(w) * 0.46)))
small = np.asarray(Image.fromarray(a.astype(np.uint8)).resize((cols, rows), Image.LANCZOS)).astype(np.float32)
lum = 0.2126 * small[:, :, 0] + 0.7152 * small[:, :, 1] + 0.0722 * small[:, :, 2]
ramp = ' .:-=+*#%@'
lo, hi = float(lum.min()), float(lum.max())
print(f"{path}  {w}x{h}  lum {lo:.0f}..{hi:.0f}  mean {lum.mean():.0f}")
print('   +' + '-' * cols + '+')
for r in range(rows):
    line = ''.join(ramp[min(len(ramp) - 1, max(0, int((lum[r, c] - lo) / max(1e-6, hi - lo) * (len(ramp) - 1))))]
                   for c in range(cols))
    print(f"{r:3d}|{line}|")
print('   +' + '-' * cols + '+')
# 色相分布（排除暗部）
mask = lum > (lo + (hi - lo) * 0.18)
if mask.any():
    px = small.reshape(-1, 3)[mask.reshape(-1)]
    q = (px // 48).astype(int)
    keys = q[:, 0] * 36 + q[:, 1] * 6 + q[:, 2]
    uq, cnt = np.unique(keys, return_counts=True)
    order = np.argsort(-cnt)[:8]
    print('主色(top8, sRGB 0-255, 占比):')
    for i in order:
        k = uq[i]
        r_, g_, b_ = k // 36 * 48, (k // 6) % 6 * 48, k % 6 * 48
        print(f'  #{r_:02x}{g_:02x}{b_:02x}  {cnt[i]/cnt.sum()*100:5.1f}%')
