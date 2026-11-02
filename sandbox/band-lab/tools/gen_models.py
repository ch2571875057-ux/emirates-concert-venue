# -*- coding: utf-8 -*-
"""
gen_models.py — 六种乐器体素模型生成器（沙盒专用，不动现有项目文件）

运行：  python sandbox/band-lab/tools/gen_models.py [--ascii]
输出：  sandbox/band-lab/models/<id>.js      （纯数据 ES module，three.js 直接 import）
        sandbox/band-lab/models/models.json  （同一份数据的 JSON，Python 侧复用）

坐标（每件模型自身）：原点 = 占地中心的地面点；i→+x，j→+y（0 = 底面），k→+z
（k 小的一侧朝观众）。落位由 band-data.js 的 {x,y,z,yaw} 决定。

尺寸全部以米书写，voxel_kit 换算成整数格；GRID = 0.05 m/格。
所有斜撑/支腿用 line3() 连续画，禁止逐格跳格（否则会断成几十个碎块）。
"""

import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voxel_kit import Grid, VOXEL, write_models_js, write_models_json, m  # noqa

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.dirname(HERE)
MODELS = os.path.join(OUT, 'models')


# ============================================================ 共用构件
def tripod(g, x, z, top, spread=0.16, c='G', leg_top=0.12):
    """三脚架：中心立柱 + 三条斜腿（斜腿用 line3 连续）。"""
    g.cyl_y(x, z, 0.02, top, 0.022, c)
    for a in (90, 210, 330):
        fx = x + math.cos(math.radians(a)) * spread
        fz = z + math.sin(math.radians(a)) * spread
        g.line3((x, leg_top, z), (fx, 0.02, fz), c)
        g.set(m(fx), 0, m(fz), c)          # 脚垫


def disc_base(g, cx, cz, r, c='G'):
    g.disc_y(cx, cz, 0.0, r, c)
    g.disc_y(cx, cz, 0.05, r * 0.7, c)


def cymbal(g, cx, cz, y, r, c='Y'):
    g.disc_y(cx, cz, y, r, c, dome=0.03)
    g.cyl_y(cx, cz, y + 0.03, y + 0.10, 0.03, 'M')     # 中心凸帽


def shell_y(g, cx, cz, y0, y1, r, shell, head):
    """竖放鼓：外壳一圈 + 上下鼓皮 + 四个鼓耳。"""
    g.cyl_y(cx, cz, y0, y1, r, shell, r_in=max(r - 0.025, 0.0))
    g.cyl_y(cx, cz, y1 - 0.02, y1, max(r - 0.025, 0.02), head)
    g.cyl_y(cx, cz, y0, y0 + 0.02, max(r - 0.025, 0.02), head)
    for a in (0, 90, 180, 270):
        g.set(m(cx + math.cos(math.radians(a)) * r),
              m((y0 + y1) / 2 - 0.02),
              m(cz + math.sin(math.radians(a)) * r), 'M')


def shell_z(g, cx, yc, z0, z1, r, shell, head):
    """横放鼓（鼓面朝 ±z）：外壳 + 前后鼓皮 + 鼓耳。"""
    g.cyl_z(cx, yc, z0, z1, r, shell, r_in=max(r - 0.025, 0.0))
    g.cyl_z(cx, yc, z0, z0 + 0.02, max(r - 0.025, 0.02), head)
    g.cyl_z(cx, yc, z1 - 0.02, z1, max(r - 0.025, 0.02), head)
    for a in (0, 90, 180, 270):
        g.set(m(cx + math.cos(math.radians(a)) * r),
              m(yc + math.sin(math.radians(a)) * r - 0.02),
              m(z0 + 0.03), 'M')


# ============================================================ 1. 架子鼓
def build_drums():
    """5 鼓（22" 大鼓 / 14" 军鼓 / 10"+12" 嗵鼓 / 16" 落地嗵鼓）3 镲 + 鼓凳。"""
    g = Grid()
    R = 0.28                            # 大鼓 22"

    # ---- 大鼓：横放，鼓面朝观众 ----
    shell_z(g, 0.0, R, -0.78, -0.33, R, 'T', 'W')
    for dx in (-0.24, 0.24):            # 大鼓支脚
        g.line3((dx, 0.16, -0.42), (dx * 1.25, 0.0, -0.30), 'G')

    # ---- 军鼓 14"：左前，顶面 0.62 ----
    tripod(g, -0.44, -0.10, 0.46, spread=0.15)
    shell_y(g, -0.44, -0.10, 0.46, 0.62, 0.18, 'C', 'W')

    # ---- 嗵鼓 10" / 12"：架在大鼓上 ----
    for x, y, r, dep in ((-0.19, 0.80, 0.13, 0.20), (0.17, 0.86, 0.15, 0.22)):
        g.cyl_y(x, -0.50, 0.54, y + 0.02, 0.016, 'C')        # 托架立柱：从大鼓顶面到嗵鼓中心
        g.line3((x, y, -0.50), (x, y + 0.02, -0.62), 'C')    # 托架横臂
        shell_z(g, x, y, -0.64, -0.64 + dep, r, 'T', 'W')

    # ---- 落地嗵鼓 16"：右后 ----
    shell_y(g, 0.64, 0.18, 0.06, 0.52, 0.20, 'T', 'W')
    for a in (30, 150, 270):
        fx = 0.64 + math.cos(math.radians(a)) * 0.21
        fz = 0.18 + math.sin(math.radians(a)) * 0.21
        g.line3((0.64, 0.24, 0.18), (fx, 0.0, fz), 'G')

    # ---- 踩镲：左，双片 0.90 / 0.96 ----
    tripod(g, -0.90, 0.10, 0.88, spread=0.15)
    cymbal(g, -0.90, 0.10, 0.88, 0.17)
    cymbal(g, -0.90, 0.10, 0.94, 0.15)

    # ---- 吊镲 16"：左前上 ----
    tripod(g, -0.62, -0.52, 1.28, spread=0.18)
    cymbal(g, -0.62, -0.52, 1.28, 0.21)

    # ---- 叮叮镲 20"：右后上 ----
    tripod(g, 0.86, 0.42, 1.12, spread=0.20)
    cymbal(g, 0.86, 0.42, 1.12, 0.25)

    # ---- 鼓凳：鼓手位（后中）----
    g.disc_y(0.0, 0.66, 0.48, 0.21, 'K')
    g.disc_y(0.0, 0.66, 0.53, 0.19, 'K')
    for a in (45, 135, 225, 315):
        fx = math.cos(math.radians(a)) * 0.19
        fz = 0.66 + math.sin(math.radians(a)) * 0.19
        g.line3((0.0, 0.46, 0.66), (fx, 0.0, fz), 'G')

    return g.normalize(0), '架子鼓', '22"大鼓 + 14"军鼓 + 10/12"嗵鼓 + 16"落地嗵鼓 + 3 镲 + 鼓凳'


# ============================================================ 2. 电吉他 / 电贝斯
def _stringed(kind='guitar'):
    """立式落地琴架，琴面朝观众（-z）。guitar 与 bass 共用轮廓，尺寸不同。"""
    g = Grid()
    if kind == 'guitar':
        bw, bh, bl = 0.32, 0.42, 0.05      # 琴体宽/高/厚
        nl, hw, hh = 0.44, 0.09, 0.15      # 琴颈长 / 琴头宽 / 琴头长
        y0 = 0.22                           # 琴体底沿离台面
    else:
        bw, bh, bl = 0.34, 0.46, 0.055
        nl, hw, hh = 0.56, 0.10, 0.19
        y0 = 0.24

    # 单缺角琴体轮廓（字符画 → 米），右上角收进
    prof = [
        '..#####...',
        '.########.',
        '##########',
        '##########',
        '.#########',
        '..#######.',
    ]
    body_c = 'T' if kind == 'guitar' else 'K'      # 吉他木色，贝斯黑亮漆
    face_c = 'O' if kind == 'guitar' else 'K'
    rows, cols = len(prof), len(prof[0])
    for r, row in enumerate(prof):
        for c, ch in enumerate(row):
            if ch != '#':
                continue
            x = -(bw / 2) + (c + 0.5) * bw / cols
            y = y0 + (rows - 1 - r + 0.5) * bh / rows
            g.set(m(x), m(y), 0, body_c)    # 琴体
            g.set(m(x), m(y), -1, face_c)   # 面板（朝观众）

    # 拾音器 / 琴桥 / 旋钮（贴在面板前一格）
    gy = y0 + bh * 0.30
    g.boxc(0.00, gy, -0.06, 0.13, 0.07, 0.02, 'K')
    g.boxc(-0.02, gy + 0.10, -0.06, 0.12, 0.07, 0.02, 'C')
    g.boxc(0.00, gy - 0.09, -0.06, 0.15, 0.03, 0.02, 'M')
    g.boxc(0.10, gy - 0.02, -0.06, 0.05, 0.05, 0.02, 'K')

    # 琴颈 + 指板 + 品丝 + 琴弦
    ny0 = y0 + bh
    g.boxc(0.0, ny0, -0.025, 0.05, nl, 0.05, 'T')
    g.boxc(0.0, ny0, -0.045, 0.048, nl, 0.02, 'S')
    for t in range(1, 12):
        g.boxc(0.0, ny0 + nl * t / 12, -0.055, 0.048, 0.008, 0.02, 'C')
    for t in range(3):
        g.boxc(-0.012 + t * 0.012, ny0, -0.065, 0.006, nl, 0.008, 'C')

    # 琴头 + 弦钮
    g.boxc(0.0, ny0 + nl, -0.025, hw, hh, 0.045, 'T')
    for sx in (-0.03, 0.0, 0.03):
        g.boxc(sx, ny0 + nl + hh * 0.25, -0.055, 0.02, 0.03, 0.02, 'C')
        g.boxc(sx, ny0 + nl + hh * 0.55, -0.055, 0.02, 0.03, 0.02, 'C')

    # 落地琴架：底托 + 双立柱 + 背撑 + 颈托
    g.boxc(0.0, 0.0, -0.03, bw + 0.06, 0.04, 0.22, 'G')
    for dx in (-bw / 2, bw / 2):
        g.boxm(dx - 0.015, 0.04, -0.11, 0.03, y0 + bh * 0.55, 0.03, 'G')
    g.boxc(0.0, 0.04, 0.06, 0.04, bh * 0.70, 0.04, 'G')          # 背撑
    g.boxc(0.0, y0 + bh * 0.55, -0.10, bw * 0.8, 0.03, 0.16, 'G')  # 琴体托臂
    g.boxc(0.0, ny0 + nl * 0.75, -0.02, 0.06, 0.04, 0.04, 'G')     # 颈托

    name = '电吉他' if kind == 'guitar' else '电贝斯'
    note = ('单缺角实心琴，立式落地琴架，琴面朝观众' if kind == 'guitar'
            else '四弦贝斯，琴颈加长，立式落地琴架')
    return g.normalize(0), name, note


def build_guitar():
    return _stringed('guitar')


def build_bass():
    return _stringed('bass')


# ============================================================ 3. 双层键盘
def build_keys():
    """双层电子琴：下层 61 键 + 上层 49 键 + X 型琴架 + 延音踏板。"""
    g = Grid()
    low_w, low_d = 1.00, 0.30
    up_w, up_d = 0.84, 0.26
    low_y, up_y = 0.62, 0.94

    def keybed(y, w, d, cz):
        g.boxc(0.0, y, cz, w, 0.06, d, 'K')                                  # 机身
        # 键床朝向观众（-z）：白键在最前，黑键压在靠后位置
        g.boxc(0.0, y + 0.06, cz - d * 0.18, w - 0.04, 0.04, 0.16, 'W')
        n = m(w - 0.04)
        x0 = -(w - 0.04) / 2
        for i in range(n):
            if i % 7 in (1, 2, 4, 5, 6):
                g.boxm(x0 + i * VOXEL + 0.002, y + 0.10, cz - d * 0.10,
                       0.012, 0.03, 0.09, 'K')
        # 控制面板在琴身后侧（+z）
        g.boxc(0.0, y + 0.06, cz + d * 0.36, w - 0.04, 0.02, 0.10, 'G')
        for t in range(4):
            g.boxc(-w / 2 + 0.10 + t * 0.075, y + 0.08, cz + d * 0.36, 0.02, 0.02, 0.03, 'C')
        g.boxc(-w / 2 + 0.10 + 4 * 0.075, y + 0.08, cz + d * 0.36, 0.02, 0.02, 0.03, 'B')

    keybed(low_y, low_w, low_d, 0.04)
    keybed(up_y, up_w, up_d, -0.04)

    # X 型琴架：两侧各一组交叉斜腿（line3 保证连续）
    for sx in (-(low_w / 2 - 0.10), (low_w / 2 - 0.10)):
        g.line3((sx, 0.02, -0.22), (sx, low_y - 0.04, 0.24), 'G')
        g.line3((sx, 0.02, 0.24), (sx, low_y - 0.04, -0.22), 'G')
        g.set(m(sx), 0, m(-0.22), 'G')
        g.set(m(sx), 0, m(0.24), 'G')
    # 横梁（连接两侧 + 托住下层）
    g.boxm(-(low_w / 2 - 0.10), low_y - 0.06, -0.05, low_w - 0.20, 0.04, 0.10, 'G')
    # 上层支撑臂
    for sx in (-(up_w / 2 - 0.06), (up_w / 2 - 0.06)):
        g.line3((sx, low_y + 0.02, 0.06), (sx, up_y - 0.02, 0.02), 'G')
    # 延音踏板（右下前方）
    g.boxc(low_w / 2 - 0.24, 0.0, -0.32, 0.14, 0.04, 0.22, 'R')
    g.boxc(low_w / 2 - 0.24, 0.0, -0.36, 0.14, 0.02, 0.06, 'G')

    return g.normalize(0), '双层键盘', '61 键下层 + 49 键上层 + X 型琴架 + 延音踏板'


# ============================================================ 4. 音箱
def _cab(g, w, h, d, units, unit_r, head_h=0.26):
    """箱体 + 前网布 + 2×2 喇叭阵列 + 顶部箱头。前脸朝 -z（观众侧）。"""
    g.boxc(0.0, 0.0, 0.0, w, h, d, 'K')
    kf = m(-d / 2)                       # 最外层前脸
    # 前脸：网布铺满（先盖住外壳的前层体素）
    g.box(m(-w / 2 + 0.035), m(w / 2 - 0.035) - 1,
          0, max(0, m(h - 0.05) - 1),
          kf, kf, 'A')
    # 上下木框
    g.box(m(-w / 2), m(w / 2) - 1, 0, max(0, m(0.04) - 1), kf, kf, 'K')
    g.box(m(-w / 2), m(w / 2) - 1, m(h - 0.05), m(h) - 1, kf, kf, 'K')
    # 喇叭阵列：前脸层画「盆 + 中心防尘帽」
    rows = max(1, units // 2)
    for r in range(rows):
        for c in (-1, 1):
            cx = c * w * 0.24
            cy = h * (r + 0.5) / rows
            g.cyl_z(cx, cy, -d / 2, -d / 2 + VOXEL, unit_r, 'G')          # 盆架
            g.cyl_z(cx, cy, -d / 2, -d / 2 + VOXEL, unit_r * 0.72, 'N')   # 纸盆
            g.cyl_z(cx, cy, -d / 2, -d / 2 + VOXEL, unit_r * 0.26, 'M')   # 防尘帽
    # 侧把手
    for sx in (-w / 2, w / 2 - 0.03):
        g.boxm(sx, h * 0.5 - 0.03, -0.06, 0.03, 0.06, 0.12, 'M')
    # 顶部箱头
    if head_h > 0:
        g.boxc(0.0, h, 0.0, w, head_h, d * 0.85, 'K')
        kh = m(-d * 0.425)
        g.box(m(-w / 2 + 0.025), m(w / 2 - 0.025) - 1,
              m(h + 0.02), max(m(h + 0.02), m(h + head_h - 0.04)) - 1,
              kh, kh, 'N')                                    # 前面板
        for t in range(6):
            g.box(m(-w / 2 + 0.09 + t * 0.11), m(-w / 2 + 0.09 + t * 0.11),
                  m(h + head_h * 0.5), m(h + head_h * 0.5), kh, kh, 'C')   # 旋钮
        g.box(m(w / 2 - 0.09), m(w / 2 - 0.09),
              m(h + head_h * 0.5), m(h + head_h * 0.5), kh, kh, 'B')       # 电源灯


def build_amp():
    """吉他半堆叠：4×12 箱体 0.76×0.76×0.36 + 箱头 0.76×0.26×0.30。"""
    g = Grid()
    _cab(g, 0.76, 0.76, 0.36, units=4, unit_r=0.155, head_h=0.26)
    return g.normalize(0), '吉他音箱堆', '4×12 箱体 + 箱头（半堆叠）'


def build_ampbass():
    """贝斯一体音箱 4×10：0.62×0.68×0.40，顶部控制面板 + 提手。"""
    g = Grid()
    _cab(g, 0.62, 0.62, 0.40, units=4, unit_r=0.115, head_h=0.0)
    # 顶部控制面板 + 旋钮 + 提手
    g.boxc(0.0, 0.62, -0.10, 0.58, 0.10, 0.20, 'N')
    for t in range(5):
        g.boxc(-0.20 + t * 0.10, 0.66, -0.18, 0.022, 0.022, 0.03, 'C')
    g.boxc(0.22, 0.66, -0.18, 0.022, 0.022, 0.03, 'B')
    g.boxc(0.0, 0.72, 0.05, 0.26, 0.03, 0.05, 'M')
    return g.normalize(0), '贝斯音箱', '4×10 一体式贝斯音箱'


# ============================================================ 5. 麦克风架
def build_micstand():
    """空置麦架：圆底座 + 立杆 + 斜臂 + 话筒。斜臂朝 +x，落位时用 yaw 指向主唱。"""
    g = Grid()
    disc_base(g, 0.0, 0.0, 0.16, 'G')
    g.cyl_y(0.0, 0.0, 0.03, 1.42, 0.024, 'G')
    g.cyl_y(0.0, 0.0, 0.58, 0.66, 0.030, 'M')      # 高度调节套环
    g.cyl_y(0.0, 0.0, 1.02, 1.08, 0.030, 'M')
    # 斜臂（从 1.40 向 +x 斜上 0.55）+ 配重
    g.line3((0.0, 1.40, 0.0), (0.52, 1.68, 0.0), 'G')
    g.boxc(-0.07, 1.37, 0.0, 0.10, 0.05, 0.04, 'G')
    # 话筒夹 + 话筒（斜向下收音）
    g.boxc(0.55, 1.62, 0.0, 0.05, 0.08, 0.06, 'K')
    g.line3((0.58, 1.68, 0.0), (0.70, 1.72, 0.0), 'C')
    g.line3((0.70, 1.72, 0.0), (0.75, 1.73, 0.0), 'K')
    return g.normalize(0), '麦克风架', '空置斜臂麦架（落位时 yaw 指向主唱侧）'


BUILDERS = [
    ('drums', build_drums),
    ('guitar', build_guitar),
    ('bass', build_bass),
    ('keys', build_keys),
    ('amp', build_amp),
    ('ampbass', build_ampbass),
    ('micstand', build_micstand),
]


def main():
    models = []
    for mid, fn in BUILDERS:
        grid, name, note = fn()
        enclosed = grid.prune_enclosed()
        grid.weld()                      # 连通修补：细支架必须连成一体
        stray = grid.settle()            # 清掉镲片/鼓耳的取整残渣
        d = grid.to_dict(mid, name, note)
        d['voxels'] = len(grid.v)
        d['pruned'] = enclosed
        d['stray'] = stray
        d['components'] = grid.components()
        d['floating'] = len(grid.floating())
        d['grounded_parts'] = sum(1 for b in grid._groups() if any(p[1] == 0 for p in b))
        models.append(d)

    write_models_json(models, os.path.join(MODELS, 'models.json'))
    write_models_js(models, MODELS)

    hdr = '%-9s %-6s %-12s %-16s %-6s %-8s %s' % (
        'id', 'voxels', 'size(格)', 'metric(m)', 'parts', 'grounded', 'floating')
    print(hdr)
    ok = True
    for d in models:
        flag = '' if d['floating'] == 0 else '  <-- 有漂浮体素'
        if d['floating']:
            ok = False
        print('%-9s %-6d %-12s %-16s %-6d %-8d %d%s' % (
            d['id'], d['voxels'], 'x'.join(map(str, d['size'])),
            'x'.join('%.2f' % v for v in d['metric']),
            d['components'], d['grounded_parts'], d['floating'], flag))
    print('\nOK' if ok else '\nFAIL: 存在漂浮体素')

    if '--ascii' in sys.argv:
        for d in models:
            g = Grid()
            for j, layer in enumerate(d['layers']):
                for k, row in enumerate(layer):
                    for i, ch in enumerate(row):
                        if ch != '.':
                            g.set(i, j, k, ch)
            for view in ('front', 'side', 'top'):
                print('\n=== %s · %s ===' % (d['id'], view))
                for line in g.ascii_view(view):
                    print(line)


if __name__ == '__main__':
    main()
