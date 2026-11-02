"""计算光棒在截图上的屏幕包围盒，用于精确裁剪出看台区域。"""
import json
import sys
import math

VIEWS = {
    'aerial':   ([-262, 175, 320], [-32, 14, 49], 50),
    'stands':   ([-32, 44, -40], [-32, 8, 80], 50),
    'sg-back':  ([-32.4, 10.2, 105], [-32.4, 8, 20], 62),
    'aud-north': ([-32.4, 21, -42], [-32.4, 10, 100], 52),
    'aud-south': ([-32.4, 36, 158], [-32.4, 9, 30], 58),
    'stagefront': ([-32, 9, 22], [-32, 12, 118], 50),
}


def sub(a, b): return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]
def cross(a, b): return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]
def norm(a):
    L = math.sqrt(sum(x*x for x in a)) or 1.0
    return [x/L for x in a]
def dot(a, b): return sum(x*y for x, y in zip(a, b))


def project(cam, look, fov, W, H, p):
    f = norm(sub(look, cam)); r = norm(cross(f, [0, 1, 0])); u = cross(r, f)
    d = sub(p, cam); z = -dot(d, f)
    if z >= -0.05: return None
    x, y = dot(d, r), dot(d, u)
    tanH = math.tan(math.radians(fov)/2); tanW = tanH * W/H
    sx, sy = (x/-z)/tanW, (y/-z)/tanH
    if abs(sx) > 1.2 or abs(sy) > 1.2: return None
    return ((sx*0.5+0.5)*W, (-sy*0.5+0.5)*H)


png_w, png_h = int(sys.argv[1]), int(sys.argv[2])
view = sys.argv[3]
sticks_json = sys.argv[4]
cam, look, fov = VIEWS[view]
data = json.load(open(sticks_json, encoding='utf-8-sig'))
xs, ys = [], []
for (x, y, z, lv) in data['sticks']:
    sp = project(cam, look, fov, png_w, png_h, [x, y, z])
    if sp:
        xs.append(sp[0]); ys.append(sp[1])
if not xs:
    print('no visible sticks'); sys.exit(1)
x0, x1 = min(xs), max(xs)
y0, y1 = min(ys), max(ys)
print(f'view={view}  n={len(xs)}  bbox px=({x0:.0f},{y0:.0f})-({x1:.0f},{y1:.0f})')
print(f'frac: {x0/png_w:.3f},{y0/png_h:.3f},{x1/png_w:.3f},{y1/png_h:.3f}')
