# -*- coding: utf-8 -*-
"""
voxel_kit.py — 体素建模工具箱（沙盒专用，零依赖项目代码）

约定
----
* 1 体素 = 0.05 m（5 cm）。理由：吉他琴体真宽 ~0.32 m，0.2 m/格只有 2 格宽、
  完全无法辨认；0.05 m 时琴体 6–7 格、琴颈 1 格，仍是硬边方块观感且比例真实。
* 尺寸以**米**书写，内部换算成整数格，避免手写格数导致比例漂移。
* 网格坐标 (i, j, k)：
    i → +x（观众看舞台的右手方向）
    j → +y（高度，j=0 为底面 = 舞台台面）
    k → +z（k 小 = 靠观众的前表面，k 大 = 舞台后方）
* 生成阶段允许负坐标，normalize() 统一平移；导出坐标从 0 开始。
* 所有构件必须 6-邻接相连：斜撑一律用 line3() 走连续体素，不能逐格跳格子。
"""

import json
import math
import os

VOXEL = 0.05            # 米 / 格
RMIN = VOXEL * 0.9      # 圆柱最小半径：低于它按 1 格宽处理，否则会画不出任何体素

PALETTE = [
    ('K', '#101219', '炭黑　箱体 / 黑键'),
    ('N', '#1b2330', '深蓝黑　背板 / 网布'),
    ('G', '#2a2f3a', '深灰　金属架 / 喇叭盆'),
    ('M', '#6e7686', '中灰　五金 / 鼓耳 / 提手'),
    ('C', '#c9d2e0', '亮银　镀铬 / 鼓圈'),
    ('W', '#f4f6fa', '纯白　鼓皮 / 白键'),
    ('B', '#2b6fd6', '舞台蓝　指示灯'),
    ('Y', '#d8b24a', '黄铜　镲片'),
    ('T', '#8a5a2b', '木色　鼓腔 / 琴身'),
    ('O', '#d9a05a', '枫木　面板 / 鼓圈'),
    ('S', '#35251b', '深棕　指板'),
    ('R', '#c0392b', '红　点缀 / 踏板'),
    ('A', '#c0703a', '橙棕　音箱网布'),
]
PALETTE_HEX = {k: v for k, v, _ in PALETTE}


def m(v):
    """米 → 格（就近取整）。"""
    return int(round(v / VOXEL))


def snap(v):
    """把米坐标对齐到体素中心，保证圆柱 / 立柱落在格子上。"""
    return (math.floor(v / VOXEL) + 0.5) * VOXEL


class Grid:
    def __init__(self):
        self.v = {}

    # ---------- 基础 ----------
    def set(self, i, j, k, c):
        self.v[(int(i), int(j), int(k))] = c

    def get(self, i, j, k):
        return self.v.get((int(i), int(j), int(k)))

    def box(self, i0, i1, j0, j1, k0, k1, c):
        for i in range(int(i0), int(i1) + 1):
            for j in range(int(j0), int(j1) + 1):
                for k in range(int(k0), int(k1) + 1):
                    self.set(i, j, k, c)

    def boxm(self, x, y, z, w, h, d, c):
        """米制盒体：(x,y,z) 为最小角，w/h/d 为尺寸（至少占 1 格）。"""
        i0, j0, k0 = m(x), m(y), m(z)
        i1 = max(m(x + w) - 1, i0)
        j1 = max(m(y + h) - 1, j0)
        k1 = max(m(z + d) - 1, k0)
        self.box(i0, i1, j0, j1, k0, k1, c)

    def boxc(self, cx, y, cz, w, h, d, c):
        """米制盒体：水平中心 (cx,cz)，y 为底面。"""
        self.boxm(cx - w / 2, y, cz - d / 2, w, h, d, c)

    # ---------- 线（斜撑 / 线缆 / 琴弦）----------
    def line3(self, p0, p1, c):
        """3D 体素连线（单轴步进，保证 6-邻接连续）。"""
        a = [m(p0[0]), m(p0[1]), m(p0[2])]
        b = [m(p1[0]), m(p1[1]), m(p1[2])]
        i, j, k = a
        self.set(i, j, k, c)
        d = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
        s = [0 if v == 0 else (1 if v > 0 else -1) for v in d]
        d = [abs(v) for v in d]
        n = max(d)
        if n == 0:
            return
        err = [d[0] * 2 - n, d[1] * 2 - n, d[2] * 2 - n]
        for _ in range(n):
            for ax in (0, 1, 2):
                if err[ax] > 0:
                    p = [i, j, k]
                    p[ax] += s[ax]
                    err[ax] -= 2 * n
                    if ax == 0:
                        i = p[0]
                    elif ax == 1:
                        j = p[1]
                    else:
                        k = p[2]
                    self.set(i, j, k, c)
            for ax in (0, 1, 2):
                err[ax] += 2 * d[ax]

    def weld(self, c='G', prefer_ground=True):
        """连通修补：把被拆散的构件用体素线接回主块（落地块优先）。

        体素风格里支架常是 1 格宽的细线，逐格跳格会断成几十块；这里做一次
        最短距离焊接，保证成品是单一连通体（也是 voxel_stats 的硬性检查项）。
        """
        groups = self._groups()
        while len(groups) > 1:
            if prefer_ground:
                groups.sort(key=lambda g: (-sum(1 for p in g if p[1] == 0), -len(g)))
            else:
                groups.sort(key=len, reverse=True)
            head, rest = groups[0], groups[1:]
            target = min(rest, key=lambda g: self._dist2(head, g))
            pa, pb = self._closest_pair(head, target)
            self.line3((pa[0] * VOXEL, pa[1] * VOXEL, pa[2] * VOXEL),
                       (pb[0] * VOXEL, pb[1] * VOXEL, pb[2] * VOXEL), c)
            groups = self._groups()
        return len(groups)

    def _groups(self):
        seen, out = set(), []
        for p in list(self.v):
            if p in seen:
                continue
            stack, block = [p], []
            seen.add(p)
            while stack:
                q = stack.pop()
                block.append(q)
                for dd in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
                    r = (q[0] + dd[0], q[1] + dd[1], q[2] + dd[2])
                    if r in self.v and r not in seen:
                        seen.add(r)
                        stack.append(r)
            out.append(block)
        return out

    def settle(self):
        """清除漂浮孤点（镲片圆边、鼓耳半格的取整残渣），外观影响可忽略。"""
        removed = 0
        for _ in range(6):
            fl = self.floating()
            if not fl:
                break
            for p in fl:
                self.v.pop(p, None)
                removed += 1
        return removed

    @staticmethod
    def _dist2(A, B):
        axs = [p[0] for p in A]; bxs = [p[0] for p in B]
        ays = [p[1] for p in A]; bys = [p[1] for p in B]
        azs = [p[2] for p in A]; bzs = [p[2] for p in B]
        dx = max(0, max(min(bxs) - max(axs), min(axs) - max(bxs)))
        dy = max(0, max(min(bys) - max(ays), min(ays) - max(bys)))
        dz = max(0, max(min(bzs) - max(azs), min(azs) - max(bzs)))
        return dx * dx + dy * dy + dz * dz

    @staticmethod
    def _closest_pair(A, B):
        best, pair = None, (A[0], B[0])
        for p in A[:: max(1, len(A) // 60)]:
            for q in B[:: max(1, len(B) // 60)]:
                d = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2
                if best is None or d < best:
                    best, pair = d, (p, q)
        return pair

    # ---------- 圆柱 / 圆盘 ----------
    def cyl_y(self, cx, cz, y0, y1, r, c, r_in=0.0):
        """竖直圆柱（轴向 +y），r 单位米。"""
        cx, cz = snap(cx), snap(cz)
        r = max(r, RMIN)
        ci, ck = cx / VOXEL - 0.5, cz / VOXEL - 0.5
        j0, j1 = m(y0), max(m(y1) - 1, m(y0))
        n = int(math.ceil(r / VOXEL)) + 1
        for j in range(j0, j1 + 1):
            for i in range(int(ci) - n, int(ci) + n + 2):
                for k in range(int(ck) - n, int(ck) + n + 2):
                    d = math.hypot((i + 0.5) * VOXEL - cx, (k + 0.5) * VOXEL - cz)
                    if r_in <= d <= r:
                        self.set(i, j, k, c)

    def cyl_z(self, cx, yc, z0, z1, r, c, r_in=0.0):
        """水平圆柱（轴向 +z）：鼓腔、音箱喇叭。"""
        cx, yc = snap(cx), snap(yc)
        r = max(r, RMIN)
        ci, cj = cx / VOXEL - 0.5, yc / VOXEL - 0.5
        k0, k1 = m(z0), max(m(z1) - 1, m(z0))
        n = int(math.ceil(r / VOXEL)) + 1
        for k in range(k0, k1 + 1):
            for i in range(int(ci) - n, int(ci) + n + 2):
                for j in range(int(cj) - n, int(cj) + n + 2):
                    d = math.hypot((i + 0.5) * VOXEL - cx, (j + 0.5) * VOXEL - yc)
                    if r_in <= d <= r:
                        self.set(i, j, k, c)

    def disc_y(self, cx, cz, y, r, c, dome=0.0):
        """水平圆盘（镲片）；dome>0 时盘心再抬 dome 米，模拟拱起（自动补立柱）。"""
        cx, cz = snap(cx), snap(cz)
        r = max(r, RMIN)
        ci, ck = cx / VOXEL - 0.5, cz / VOXEL - 0.5
        j, jd = m(y), m(y + dome)
        n = int(math.ceil(r / VOXEL)) + 1
        for i in range(int(ci) - n, int(ci) + n + 2):
            for k in range(int(ck) - n, int(ck) + n + 2):
                d = math.hypot((i + 0.5) * VOXEL - cx, (k + 0.5) * VOXEL - cz)
                if d <= r:
                    if dome and d <= r * 0.4:
                        for jj in range(j, jd + 1):   # 拱起处补满立柱，避免漂浮
                            self.set(i, jj, k, c)
                    else:
                        self.set(i, j, k, c)

    # ---------- 修剪 / 校验 ----------
    def prune_enclosed(self):
        """删掉六面都被包住的体素（外观不变，数据量大幅下降）。"""
        dead = [p for p in self.v
                if all((p[0] + d[0], p[1] + d[1], p[2] + d[2]) in self.v
                       for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)))]
        for p in dead:
            del self.v[p]
        return len(dead)

    def bounds(self):
        if not self.v:
            return (0, 0, 0, 0, 0, 0)
        xs = [p[0] for p in self.v]
        ys = [p[1] for p in self.v]
        zs = [p[2] for p in self.v]
        return (min(xs), min(ys), min(zs), max(xs), max(ys), max(zs))

    def size(self):
        x0, y0, z0, x1, y1, z1 = self.bounds()
        return (x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1)

    def normalize(self, pad=0):
        x0, y0, z0, _, _, _ = self.bounds()
        out = Grid()
        for (i, j, k), c in self.v.items():
            out.set(i - x0 + pad, j - y0 + pad, k - z0 + pad, c)
        return out

    def components(self):
        seen, comps = set(), 0
        for p in list(self.v):
            if p in seen:
                continue
            comps += 1
            stack = [p]
            seen.add(p)
            while stack:
                i, j, k = stack.pop()
                for di, dj, dk in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
                    q = (i + di, j + dj, k + dk)
                    if q in self.v and q not in seen:
                        seen.add(q)
                        stack.append(q)
        return comps

    def floating(self):
        """漂浮体素：正下方无体素，且同层四邻接也没有体素。"""
        bad = []
        for (i, j, k) in self.v:
            if j == 0 or (i, j - 1, k) in self.v:
                continue
            if not any((i + di, j, k + dk) in self.v
                       for di, dk in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                bad.append((i, j, k))
        return bad

    # ---------- 导出 ----------
    def to_dict(self, mid, name, note=''):
        nx, ny, nz = self.size()
        layers = []
        for j in range(ny):
            layers.append([''.join(self.get(i, j, k) or '.' for i in range(nx))
                           for k in range(nz)])
        return {
            'id': mid, 'name': name, 'note': note,
            'voxel': VOXEL,
            'size': [nx, ny, nz],
            'metric': [round(nx * VOXEL, 2), round(ny * VOXEL, 2), round(nz * VOXEL, 2)],
            'palette': PALETTE_HEX,
            'layers': layers,
        }

    # ---------- ASCII 三视图（与四视图同一份数据，用于无图环境自检）----------
    def ascii_view(self, view='front'):
        nx, ny, nz = self.size()
        out = []
        if view == 'front':        # 观众看舞台：i→右，j→上
            for j in range(ny - 1, -1, -1):
                out.append(''.join(self._first_k(i, j, nz) for i in range(nx)))
        elif view == 'back':       # 从舞台后方看：i 反向
            for j in range(ny - 1, -1, -1):
                out.append(''.join(self._first_k(i, j, nz, back=True) for i in range(nx - 1, -1, -1)))
        elif view == 'side':       # 从 +x 看：k→右，j→上
            for j in range(ny - 1, -1, -1):
                out.append(''.join(self._side_cell(j, k, nx) for k in range(nz)))
        elif view == 'top':        # 俯视：i→右，k→下（后排在下）
            for k in range(nz):
                out.append(''.join(self._top_cell(i, k, ny) for i in range(nx)))
        return out

    def _first_k(self, i, j, nz, back=False):
        # front（观众视角）= 从 k 小的一端开始看；back = 从 k 大的一端看
        rng = range(nz) if not back else range(nz - 1, -1, -1)
        for k in rng:
            c = self.get(i, j, k)
            if c:
                return c
        return '.'

    def _side_cell(self, j, k, nx):
        for i in range(nx - 1, -1, -1):
            c = self.get(i, j, k)
            if c:
                return c
        return '.'

    def _top_cell(self, i, k, ny):
        for j in range(ny - 1, -1, -1):
            c = self.get(i, j, k)
            if c:
                return c
        return '.'


# ============================================================ 落盘
def write_models_json(models, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump({'voxel': VOXEL, 'palette': PALETTE_HEX, 'models': models},
                  f, ensure_ascii=False, indent=1)


def write_models_js(models, outdir):
    """每件乐器一个纯数据 ES module（无 three 依赖），外加 index.js 汇总。"""
    os.makedirs(outdir, exist_ok=True)
    for mm in models:
        mid = mm['id']
        with open(os.path.join(outdir, mid + '.js'), 'w', encoding='utf-8') as f:
            f.write('// %s — 体素数据（1 格 = %.2f m）。由 tools/gen_models.py 生成，勿手改。\n'
                    % (mm['name'], mm['voxel']))
            f.write('export const MODEL = %s;\n' % json.dumps(mm, ensure_ascii=False))
    with open(os.path.join(outdir, 'index.js'), 'w', encoding='utf-8') as f:
        f.write('// 六种乐器体素数据汇总（仅沙盒内使用）\n')
        for mm in models:
            f.write("export { MODEL as %s } from './%s.js';\n" % (mm['id'].upper(), mm['id']))
        f.write('\nexport const ALL = [\n')
        for mm in models:
            f.write('  %s,\n' % mm['id'].upper())
        f.write('];\n')
