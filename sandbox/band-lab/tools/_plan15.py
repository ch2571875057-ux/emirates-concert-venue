# -*- coding: utf-8 -*-
"""临时：按 1.5 倍缩放乐器后，重新核算摆位与乐手位置（不改任何文件）。"""
import json
import math
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
with open(os.path.join(LAB, 'export', 'blender', 'stats.json'), encoding='utf-8') as f:
    stats = {s['id']: s for s in json.load(f)}

S = 1.5
WAVE_X, WALL_Z = 20.0, 110.5
Z0, Z1 = 92.0, 116.0
HALF_W = 30.0
SINGER = (0.0, 98.0, 0.9)

LAYOUT = {
    'drums':   dict(x=-11.5, z=107.0, yaw=10.0),
    'guitar':  dict(x=-15.0, z=100.5, yaw=18.0),
    'amp':     dict(x=-17.5, z=105.0, yaw=-16.0),
    'keys':    dict(x=12.0,  z=107.0, yaw=-10.0),
    'bass':    dict(x=15.0,  z=100.5, yaw=-18.0),
    'ampbass': dict(x=17.5,  z=108.5, yaw=16.0),
}
# 乐手：w/d/h 是 GLB 实测包围盒 × 1.72
PERF_SIZE = {'crowd_a': (0.802, 1.071, 1.696), 'crowd_b': (0.802, 0.902, 1.708)}


def rot_aabb(w, d, yaw_deg):
    t = math.radians(yaw_deg)
    c, s = abs(math.cos(t)), abs(math.sin(t))
    return (w * c + d * s) / 2.0, (w * s + d * c) / 2.0


ents = []
for mid, lay in LAYOUT.items():
    w, h, d = [v * S for v in stats[mid]['size_m']]
    hx, hz = rot_aabb(w, d, lay['yaw'])
    ents.append([mid, lay['x'], lay['z'], hx, hz, h])

for mid, lay, model in (
    ('p_guitar', LAYOUT['guitar'], 'crowd_a'),
    ('p_bass', LAYOUT['bass'], 'crowd_b'),
    ('p_drums', LAYOUT['drums'], 'crowd_a'),
    ('p_keys', LAYOUT['keys'], 'crowd_b'),
):
    w, d, h = PERF_SIZE[model]
    hx, hz = rot_aabb(w, d, lay['yaw'])
    # 站在乐器正后方（z 增大方向），前缘刚好不插进乐器背面
    z = lay['z'] + ents[[e[0] for e in ents].index(mid[2:])][4] + hz + 0.06
    ents.append([mid, lay['x'], z, hx, hz, h])

print('%-10s %8s %8s %8s %8s %8s  %s' % ('id', 'x', 'z', 'x0', 'x1', 'z1', 'h'))
for mid, x, z, hx, hz, h in ents:
    print('%-10s %8.2f %8.2f %8.2f %8.2f %8.2f  %.2f' % (mid, x, z, x - hx, x + hx, z + hz, h))

print()
bad = []
for mid, x, z, hx, hz, h in ents:
    if x - hx < -HALF_W or x + hx > HALF_W:
        bad.append('%s 横向出台' % mid)
    if z - hz < Z0 or z + hz > Z1:
        bad.append('%s 纵深出台 %.2f..%.2f' % (mid, z - hz, z + hz))
    if x + hx > WAVE_X or x - hx < -WAVE_X:
        bad.append('%s 侵海浪区 %.2f..%.2f' % (mid, x - hx, x + hx))
    if z + hz > WALL_Z:
        bad.append('%s 侵屏墙 %.2f' % (mid, z + hz))
    dx = max(0.0, abs(x - SINGER[0]) - hx)
    dz = max(0.0, abs(z - SINGER[1]) - hz)
    gap = math.hypot(dx, dz) - SINGER[2]
    if gap < 0.35:
        bad.append('%s 离主唱 %.2f' % (mid, gap))

for i in range(len(ents)):
    for j in range(i + 1, len(ents)):
        a, b = ents[i], ents[j]
        ox = min(a[1] + a[3], b[1] + b[3]) - max(a[1] - a[3], b[1] - b[3])
        oz = min(a[2] + a[4], b[2] + b[4]) - max(a[2] - a[4], b[2] - b[4])
        if ox > 0.02 and oz > 0.02:
            bad.append('%s × %s 重叠 %.2f×%.2f' % (a[0], b[0], ox, oz))

print('问题 %d 项' % len(bad))
for b in bad:
    print('  -', b)
