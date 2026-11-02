"""为 6 个固定机位求解「刚好把全部乐器框进画面」的相机位置与 fov。

思路：机位方向（视线方向）与注视点由人工给定（要保证画面构图，比如正视、
45°、顶视、左右侧、背面），然后二分搜索相机距离，使全部乐器包围盒的
8 个角点都落在 NDC ±PAD 之内，再报告实际画面占比。

输出可直接粘回 band-lab.js 的 VIEWS 与 qa_framing.py 的 VIEWS。
"""
import json
import math
import os

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)

# 乐器整体放大倍数（与 band-lab.js 的 SCALE 一致）
SCALE = 1.5

LAYOUT = {
    "drums":    {"x": -11.5, "z": 107.0, "yaw": 10},
    "guitar":   {"x": -15.0, "z": 100.5, "yaw": 18},
    "amp":      {"x": -17.5, "z": 105.0, "yaw": -16},
    "keys":     {"x": 12.0,  "z": 107.0, "yaw": -10},
    "bass":     {"x": 15.0,  "z": 100.5, "yaw": -18},
    "ampbass":  {"x": 17.5,  "z": 108.5, "yaw": 16},
}

# 乐手（主项目观众模型上台，四人两模型复用）：尺寸 = GLB 实测包围盒 × scale 1.72，单位 m。
# 它们比多数乐器高一截，会直接决定「正视/背视」机位需要退多远，必须一起参与求解。
PERFORMERS = {
    "p_guitar": {"x": -15.0, "z": 101.5, "yaw": 84, "size": (0.802, 1.696, 1.071)},
    "p_bass":   {"x": 15.0,  "z": 101.5, "yaw": 96, "size": (0.802, 1.708, 0.902)},
    "p_drums":  {"x": -11.5, "z": 109.4, "yaw": 92, "size": (0.802, 1.708, 0.902)},
    "p_keys":   {"x": 12.0,  "z": 108.4, "yaw": 88, "size": (0.802, 1.696, 1.071)},
}

FRONT_Z = 92.0
STAGE_D = 24.0
CENTER_Z = FRONT_Z + STAGE_D / 2
ASPECT = 1600 / 1000
PAD = 0.90          # 允许的最大 |NDC|

# 每个机位：视线方向（从注视点指向相机的方向）+ 注视点 + fov
# 这些都是「构图意图」，不参与搜索。
SPEC = {
    "front":   {"dir": (0.0, 0.16, -1.0), "look": (0.0, 0.95, 3.0), "fov": 58},
    "front45": {"dir": (0.72, 0.42, -0.55), "look": (0.0, 1.20, 2.0), "fov": 52},
    "top":     {"dir": (0.001, 1.0, 0.06), "look": (0.0, 0.60, 2.0), "fov": 46},
    "left":    {"dir": (-1.0, 0.30, -0.30), "look": (-13.0, 1.10, 2.0), "fov": 56},
    "right":   {"dir": (1.0, 0.30, -0.30), "look": (13.0, 1.10, 2.0), "fov": 56},
    "back":    {"dir": (0.0, 0.34, 1.0), "look": (0.0, 1.10, 1.0), "fov": 58},
}


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vadd(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vmul(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def cross(a, b):
    return (a[1] * b[2] - a[2] * b[1],
            a[2] * b[0] - a[0] * b[2],
            a[0] * b[1] - a[1] * b[0])


def norm(a):
    l = math.sqrt(dot(a, a)) or 1.0
    return (a[0] / l, a[1] / l, a[2] / l)


class Cam:
    def __init__(self, pos, look, fov):
        self.pos = pos
        self.f = norm(vsub(look, pos))
        self.r = norm(cross(self.f, (0, 1, 0)))
        self.u = cross(self.r, self.f)
        self.t = math.tan(math.radians(fov) / 2)

    def ndc(self, p):
        d = vsub(p, self.pos)
        z = dot(d, self.f)
        if z <= 0.01:
            return None
        return (dot(d, self.r) / (z * self.t * ASPECT),
                dot(d, self.u) / (z * self.t))


def corners(center, size, yaw_deg):
    hx, hy, hz = size[0] / 2, size[1] / 2, size[2] / 2
    a = math.radians(yaw_deg)
    ca, sa = math.cos(a), math.sin(a)
    out = []
    for sx in (-1, 1):
        for sy in (-1, 1):
            for sz in (-1, 1):
                x, z = sx * hx, sz * hz
                rx = x * ca + z * sa
                rz = -x * sa + z * ca
                out.append((center[0] + rx, center[1] + sy * hy, center[2] + rz))
    return out


def main():
    with open(os.path.join(LAB, "models", "models.json"), encoding="utf-8") as f:
        models = {m["id"]: m for m in json.load(f)["models"]}

    # 全部点集 + 每件自己的点集（用来报占比）
    per = {}
    allpts = []
    for mid, lay in LAYOUT.items():
        size = tuple(v * SCALE for v in models[mid]["metric"])
        c = (lay["x"], size[1] / 2, lay["z"] - CENTER_Z)
        pts = corners(c, size, lay["yaw"])
        per[mid] = (pts, c, size)
        allpts += pts
    for mid, lay in PERFORMERS.items():
        size = lay["size"]
        c = (lay["x"], size[1] / 2, lay["z"] - CENTER_Z)
        pts = corners(c, size, lay["yaw"])
        per[mid] = (pts, c, size)
        allpts += pts

    out = {}
    for view, spec in SPEC.items():
        look = spec["look"]
        fov = spec["fov"]
        d = norm(spec["dir"])
        lo, hi = 2.0, 400.0
        for _ in range(60):
            mid_ = (lo + hi) / 2
            cam = Cam(vadd(look, vmul(d, mid_)), look, fov)
            ok = True
            for p in allpts:
                n = cam.ndc(p)
                if n is None or abs(n[0]) > PAD or abs(n[1]) > PAD:
                    ok = False
                    break
            if ok:
                hi = mid_
            else:
                lo = mid_
        dist = hi
        cam = Cam(vadd(look, vmul(d, dist)), look, fov)
        pos = vadd(look, vmul(d, dist))
        xs = [cam.ndc(p)[0] for p in allpts]
        ys = [cam.ndc(p)[1] for p in allpts]
        print("%-8s dist=%6.2f m  pos=(%7.2f,%6.2f,%7.2f)  ndc x[%5.2f,%5.2f] y[%5.2f,%5.2f]"
              % (view, dist, pos[0], pos[1], pos[2],
                 min(xs), max(xs), min(ys), max(ys)))
        for mid, (pts, c, size) in per.items():
            nx = [cam.ndc(p)[0] for p in pts]
            ny = [cam.ndc(p)[1] for p in pts]
            print("      %-9s w=%4.1f%% h=%4.1f%%  x[%5.2f,%5.2f] y[%5.2f,%5.2f]"
                  % (mid, (max(nx) - min(nx)) / 2 * 100, (max(ny) - min(ny)) / 2 * 100,
                     min(nx), max(nx), min(ny), max(ny)))
        out[view] = {"pos": [round(v, 2) for v in pos],
                     "look": [round(v, 2) for v in look],
                     "fov": fov}
    print()
    print("// ---- 复制到 band-lab.js 的 VIEWS ----")
    for k, v in out.items():
        print('  %-8s { pos: [%s], look: [%s], fov: %d },'
              % (k + ":", ", ".join("%g" % x for x in v["pos"]),
                 ", ".join("%g" % x for x in v["look"]), v["fov"]))
    print()
    print("// ---- 复制到 tools/qa_framing.py 的 VIEWS ----")
    for k, v in out.items():
        print('    %-10s {"pos": (%s), "look": (%s), "fov": %d},'
              % ('"%s":' % k, ", ".join("%g" % x for x in v["pos"]),
                 ", ".join("%g" % x for x in v["look"]), v["fov"]))


if __name__ == "__main__":
    main()
