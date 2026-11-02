"""差分验收：同一机位分别截「点阵模式」和「普通模式」两张图，
把每支应援棒投影到两图同一像素，比较它在两种模式下的亮度差。

这个思路免疫于背景亮度（看台/看台后面本来就亮），直接回答两个问题：
  1) 图案格（main）在点阵模式下应当明显变亮；
  2) 非图案格（dim）在点阵模式下应当变暗但**不是黑掉**（底光保留）。

用法:
  python tools/verify_diff.py <pixel.png> <normal.png> <sticks.json> <view_id> <pattern>
"""
import json
import sys
import math
from PIL import Image

VIEWS = {
    'aerial':   ([-262, 175, 320], [-32, 14, 49], 50),
    'stagefront': ([-32, 9, 22], [-32, 12, 118], 50),
    'stands':   ([-32, 44, -40], [-32, 8, 80], 50),
    'facade':   ([-32, 42, 402], [-32, 24, 49], 42),
    'roof':     ([-32, 330, 49.5], [-32, 4, 49], 45),
    'aud-pit':   ([-32.4, 8.8, 68], [-32.4, 9.5, 100], 60),
    'aud-north': ([-32.4, 21, -42], [-32.4, 10, 100], 52),
    'aud-east':  ([42, 20, 48], [-32.4, 10, 92], 52),
    'aud-west':  ([-108, 20, 48], [-32.4, 10, 92], 52),
    'aud-south': ([-32.4, 36, 158], [-32.4, 9, 30], 58),
    'sg-back':   ([-32.4, 10.2, 105], [-32.4, 8, 20], 62),
}


def sub(a, b):
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def cross(a, b):
    return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]


def norm(a):
    L = math.sqrt(a[0] ** 2 + a[1] ** 2 + a[2] ** 2) or 1.0
    return [a[0] / L, a[1] / L, a[2] / L]


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def project(cam, look, fov, W, H, p):
    f = norm(sub(look, cam))
    r = norm(cross(f, [0, 1, 0]))
    u = cross(r, f)
    d = sub(p, cam)
    z = -dot(d, f)
    if z >= -0.05:
        return None
    x, y = dot(d, r), dot(d, u)
    tanH = math.tan(math.radians(fov) / 2)
    tanW = tanH * W / H
    sx, sy = (x / -z) / tanW, (y / -z) / tanH
    if abs(sx) > 1.02 or abs(sy) > 1.02:
        return None
    return (int((sx * 0.5 + 0.5) * W), int((-sy * 0.5 + 0.5) * H))


def lum_at(px, W, H, sx, sy, rad=1):
    tot, n = 0.0, 0
    for yy in range(max(0, sy - rad), min(H, sy + rad + 1)):
        for xx in range(max(0, sx - rad), min(W, sx + rad + 1)):
            r, g, b = px[xx, yy]
            tot += 0.2126 * r + 0.7152 * g + 0.0722 * b
            n += 1
    return tot / n if n else 0.0


def main():
    png_px, png_nm, sticks_json, view_id, pattern = sys.argv[1:6]
    ip = Image.open(png_px).convert('RGB')
    inn = Image.open(png_nm).convert('RGB')
    W, H = ip.size
    pp, pn = ip.load(), inn.load()
    cam, look, fov = VIEWS[view_id]

    data = json.load(open(sticks_json, encoding='utf-8-sig'))
    sticks, states = data['sticks'], data['states'][pattern]

    acc = {0: [], 1: [], 2: []}
    for i, stick in enumerate(sticks):
        x, y, z = stick[0], stick[1], stick[2]   # 第 4 位是 level，投影只需 xyz
        sp = project(cam, look, fov, W, H, [x, y, z])
        if not sp:
            continue
        acc[states[i]].append((lum_at(pn, W, H, *sp), lum_at(pp, W, H, *sp)))

    print(f'{png_px} / {png_nm}   view={view_id} pattern={pattern}')
    print(f'{"state":6s} {"n":>5s} {"normal":>8s} {"pixel":>8s} {"delta":>8s} {"变亮%":>7s} {"保持可见%":>9s}')
    stats = {}
    for st, nm in ((2, 'main'), (1, 'halo'), (0, 'dim')):
        vals = acc[st]
        if not vals:
            print(f'{nm:6s} {0:>5d}  (无投影点)')
            continue
        a = sum(v[0] for v in vals) / len(vals)
        b = sum(v[1] for v in vals) / len(vals)
        # 「变亮」用相对判据：远距离机位下绝对增量很小，但相对倍数很显著
        up = 100.0 * sum(1 for v0, v1 in vals if v1 > max(v0 * 1.6, v0 + 6)) / len(vals)
        # 「保持可见」：点阵模式下亮度仍 > 该组普通模式亮度的一半
        vis = 100.0 * sum(1 for v0, v1 in vals if v1 > v0 * 0.5) / len(vals)
        stats[nm] = (a, b, up, vis)
        print(f'{nm:6s} {len(vals):>5d} {a:>8.1f} {b:>8.1f} {b - a:>+8.1f} {up:>6.1f}% {vis:>8.1f}%')

    ok = True
    if 'main' in stats and 'dim' in stats:
        main_up = stats['main'][2]
        print(f'\n图案格变亮比例 = {main_up:.1f}%')
        if main_up < 40:
            print('❌ 图案格没有在点阵模式下变亮')
            ok = False
        else:
            print('✅ 图案格在点阵模式下明显变亮')
        dim_vis = stats['dim'][3]
        print(f'非图案格保持可见比例 = {dim_vis:.1f}%（旧实现 dim=0.05 时应接近 0）')
        if dim_vis < 60:
            print('❌ 非图案格被压黑（"一部分观众不再发光"未修复）')
            ok = False
        else:
            print('✅ 非图案格保留底光，没有压黑')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
