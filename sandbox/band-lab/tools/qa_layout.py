# -*- coding: utf-8 -*-
"""
qa_layout.py — 编制摆位的客观校验（不依赖看图）

读 export/blender/stats.json 的实测尺寸 + LAYOUT 摆位，检查：
  1. 每件是否完整落在舞台台面上（x 相对中轴、z 绝对纵深）
  2. 是否侵入主项目已有的「海浪雕塑」区（|x 偏移| >= 20）与屏墙（z >= 110.5）
  3. 与主唱位置（x=0 相对中轴、z=98、半径 0.9 m）的净空
  4. 任意两件的水平包围盒是否重叠（按 yaw 旋转后的 AABB）
  5. 左右两侧是否基本对称（|左总宽 - 右总宽|）

用法： python tools/qa_layout.py
"""
import json
import math
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
STATS = os.path.join(LAB, 'export', 'blender', 'stats.json')

STAGE_W, STAGE_D, FRONT_Z = 60.0, 24.0, 92.0
HALF_W = STAGE_W / 2.0
Z0, Z1 = FRONT_Z, FRONT_Z + STAGE_D          # 92 .. 116
WAVE_X = 20.0                                 # 海浪雕塑内边界
WALL_Z = 110.5                                # 屏墙前沿
SINGER = dict(x=0.0, z=98.0, r=0.9)

# 乐器整体放大倍数（与 band-lab.js 的 SCALE 一致）：
# 体素模型按真实尺寸建，但 1.7 m 的乐手站旁边时乐器显得偏小，
# 用户要求放大 1.5 倍以适配乐手。校验必须按放大后的尺寸算，否则会漏判出台/重叠。
SCALE = 1.5

# 与 blender_build.py / band-lab.js 同源
# micstand 已按用户要求从舞台编制里移除（「麦克风架不用」），故不参与校验。
LAYOUT = {
    'drums':    dict(x=-11.5, z=107.0, yaw=10.0),
    'guitar':   dict(x=-15.0, z=100.5, yaw=18.0),
    'amp':      dict(x=-17.5, z=105.0, yaw=-16.0),
    'keys':     dict(x=12.0,  z=107.0, yaw=-10.0),
    'bass':     dict(x=15.0,  z=100.5, yaw=-18.0),
    'ampbass':  dict(x=17.5,  z=108.5, yaw=16.0),
}
LABELS = {
    'drums': '架子鼓', 'guitar': '电吉他', 'amp': '吉他音箱',
    'keys': '双层键盘', 'bass': '电贝斯', 'ampbass': '贝斯音箱',
}

# 乐手：主项目观众模型（assets/crowd_a|crowd_b.glb）上台当表演者，四人两模型复用。
# w/d/h 为该 GLB 实测包围盒 × scale 1.72：0.466×0.986×0.622 → 0.80×1.70×1.07 m。
# 站位与 band-lab.js 的 PERFORMERS 逐字一致。
PERFORMERS = {
    'p_guitar': dict(x=-15.0, z=101.5, yaw=84.0, w=0.802, d=1.071, h=1.696, label='吉他手'),
    'p_bass':   dict(x=15.0,  z=101.5, yaw=96.0, w=0.802, d=0.902, h=1.708, label='贝斯手'),
    'p_drums':  dict(x=-11.5, z=109.4, yaw=92.0, w=0.802, d=0.902, h=1.708, label='鼓手'),
    'p_keys':   dict(x=12.0,  z=108.4, yaw=88.0, w=0.802, d=1.071, h=1.696, label='键盘手'),
}


def rot_aabb(w, d, yaw_deg):
    """把 w×d 的矩形绕中心旋转后，返回新的轴对齐半宽/半深。"""
    t = math.radians(yaw_deg)
    c, s = abs(math.cos(t)), abs(math.sin(t))
    return (w * c + d * s) / 2.0, (w * s + d * c) / 2.0


def main():
    if not os.path.exists(STATS):
        print('缺少 %s，请先跑 tools/blender_build.py' % STATS)
        return 2
    with open(STATS, encoding='utf-8') as f:
        stats = {s['id']: s for s in json.load(f)}

    # 统一成 (id, 名称, x, z, yaw, w, h, d)：乐器取自实测 stats，乐手取自 GLB 实测包围盒
    entries = []
    for m in ('drums', 'guitar', 'amp', 'keys', 'bass', 'ampbass'):
        if m not in stats:
            print('stats.json 缺少 %s，请先跑 tools/blender_build.py' % m)
            return 2
        # 按 SCALE 放大后的实际占位算，否则漏判放大后的出台/重叠
        w, h, d = [v * SCALE for v in stats[m]['size_m']]
        lay = LAYOUT[m]
        entries.append((m, LABELS[m], lay['x'], lay['z'], lay['yaw'], w, h, d))
    for pid, p in PERFORMERS.items():
        entries.append((pid, p['label'], p['x'], p['z'], p['yaw'], p['w'], p['h'], p['d']))

    print('%-9s %-9s %-18s %-30s %s'
          % ('id', '名称', '尺寸 w×h×d (m)', '水平包围盒 x/z', '检查'))
    boxes = {}
    problems = []
    for (mid, label, px, pz, yaw, w, h, d) in entries:
        hx, hz = rot_aabb(w, d, yaw)
        x0, x1 = px - hx, px + hx
        z0, z1 = pz - hz, pz + hz
        boxes[mid] = (x0, x1, z0, z1, h)

        notes = []
        if x0 < -HALF_W or x1 > HALF_W:
            notes.append('横向出台')
            problems.append('%s 横向超出舞台（%.2f..%.2f）' % (mid, x0, x1))
        if z0 < Z0 or z1 > Z1:
            notes.append('纵深出台')
            problems.append('%s 纵深超出舞台（%.2f..%.2f）' % (mid, z0, z1))
        if x1 > WAVE_X or x0 < -WAVE_X:
            notes.append('侵入海浪区')
            problems.append('%s 侵入海浪雕塑区（|x|>%.0f）' % (mid, WAVE_X))
        if z1 > WALL_Z:
            notes.append('侵入屏墙')
            problems.append('%s 侵入屏墙（z>%.1f）' % (mid, WALL_Z))

        # 与主唱净空（用水平距离减各自半径的近似）
        dx = max(0.0, abs(px - SINGER['x']) - hx)
        dz = max(0.0, abs(pz - SINGER['z']) - hz)
        gap = math.hypot(dx, dz) - SINGER['r']
        if gap < 0.35:
            notes.append('离主唱过近 %.2fm' % gap)
            problems.append('%s 与主唱净空仅 %.2f m' % (mid, gap))

        print('%-9s %-9s %-18s x %6.2f..%6.2f  z %6.2f..%6.2f  %s'
              % (mid, label, '%.2f×%.2f×%.2f' % (w, h, d), x0, x1, z0, z1,
                 ' '.join(notes) if notes else 'OK'))

    # 两两重叠（只比水平投影，高度差 > 0.05 也算重叠，因为乐器要立在地上）
    print()
    ids = list(boxes)
    for i in range(len(ids)):
        for j in range(i + 1, len(ids)):
            a, b = boxes[ids[i]], boxes[ids[j]]
            ox = min(a[1], b[1]) - max(a[0], b[0])
            oz = min(a[3], b[3]) - max(a[2], b[2])
            if ox > 0.02 and oz > 0.02:
                problems.append('%s 与 %s 水平投影重叠 %.2f×%.2f m'
                                % (ids[i], ids[j], ox, oz))
                print('重叠: %-9s × %-9s  %.2f × %.2f m' % (ids[i], ids[j], ox, oz))

    # 左右对称粗检（乐器 + 乐手一起算）
    pos = {e[0]: e[2] for e in entries}
    left = [m for m in boxes if pos[m] < 0]
    right = [m for m in boxes if pos[m] > 0]

    def extent(group):
        if not group:
            return 0.0
        return max(abs(boxes[m][0]), abs(boxes[m][1]))

    el, er = extent(left), extent(right)
    print()
    print('左侧最外 |x| = %.2f m（%d 件），右侧最外 |x| = %.2f m（%d 件），差 %.2f m'
          % (el, len(left), er, len(right), abs(el - er)))

    print()
    if problems:
        print('发现 %d 个问题：' % len(problems))
        for p in problems:
            print('  -', p)
        return 1
    print('摆位校验通过：全部落在舞台台面内、未侵入海浪雕塑区/屏墙、'
          '彼此无水平重叠、与主唱保留净空。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
