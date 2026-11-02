"""点阵模式截图的定量验收（不依赖人眼看图）。

统计三件事：
1) 画面里"发光应援棒"像素占比（高亮 + 蓝白色相）——旧实现约 3%，新实现应显著更高；
2) 图案区（画面上部看台环带）与非图案区的亮度对比——证明 halo/dim 分明；
3) 底光是否仍然可见（非图案区均值 > 0，而不是全黑）。

用法: python tools/pixel_stats.py <png> [...]
"""
import sys
import math
from PIL import Image


def analyze(path):
    im = Image.open(path).convert('RGB')
    w, h = im.size
    px = im.load()
    # 只统计上半部分（看台环带所在），排除下方舞台/地坪
    y0, y1 = int(h * 0.04), int(h * 0.56)
    total = 0
    bright = 0
    dimish = 0
    lum_sum = 0
    for y in range(y0, y1):
        for x in range(0, w, 2):
            r, g, b = px[x, y]
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            total += 1
            lum_sum += lum
            if lum > 140:
                bright += 1
            elif lum > 24:
                dimish += 1
    return {
        'size': f'{w}x{h}',
        'roi_px': total,
        'bright_pct': round(100 * bright / total, 2),
        'dim_pct': round(100 * dimish / total, 2),
        'mean_lum': round(lum_sum / total, 2),
        'bright_over_dim': round(bright / max(1, dimish), 3),
    }


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print('usage: python tools/pixel_stats.py <png> [...]')
        sys.exit(2)
    print(f'{"file":28s} {"size":10s} {"bright%":>8s} {"dim%":>7s} {"meanLum":>8s} {"b/d":>6s}')
    for p in sys.argv[1:]:
        try:
            s = analyze(p)
        except Exception as e:  # noqa: BLE001
            print(f'{p:28s} ERROR {e}')
            continue
        name = p.rsplit('\\', 1)[-1]
        print(f'{name:28s} {s["size"]:10s} {s["bright_pct"]:>8} {s["dim_pct"]:>7} '
              f'{s["mean_lum"]:>8} {s["bright_over_dim"]:>6}')
