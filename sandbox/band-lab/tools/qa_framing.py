"""用 Python 复算沙盒页的机位取景，检查每件乐器在画面里的占比。
页面里 focusItem() 的算法是：对乐器包围盒 8 个角点做二分，求「刚好全部落进
NDC ±FILL（FILL=0.86）」的最近距离，相机方向 dir = (0.62, 0.42, -0.66).normalize()。
固定机位见 band-lab.js 的 VIEWS。
这里不连浏览器，直接用同样的参数把包围盒 8 个角点投影到屏幕上，算出「模型占画面的百分比」和「是否贴边/出画」。模型尺寸取自 models.json。"""
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

# 乐手（主项目观众模型上台）：尺寸 = GLB 实测包围盒 × scale 1.72（米）。
# 他们要一起参与取景判定，否则「机位把乐器框住了但把人切掉」不会被发现。
PERFORMERS = {
    "p_guitar": {"x": -15.0, "z": 101.5, "yaw": 84, "label": "吉他手"},
    "p_bass":   {"x": 15.0,  "z": 101.5, "yaw": 96, "label": "贝斯手"},
    "p_drums":  {"x": -11.5, "z": 109.4, "yaw": 92, "label": "鼓手"},
    "p_keys":   {"x": 12.0,  "z": 108.4, "yaw": 88, "label": "键盘手"},
}
PERFORMER_SIZE = {
    "p_guitar": (0.802, 1.696, 1.071),
    "p_bass":   (0.802, 1.708, 0.902),
    "p_drums":  (0.802, 1.708, 0.902),
    "p_keys":   (0.802, 1.696, 1.071),
}

FRONT_Z = 92.0
STAGE_D = 24.0
CENTER_Z = FRONT_Z + STAGE_D / 2
ASPECT = 1600 / 1000

VIEWS = {
    # 与 band-lab.js 的 VIEWS 保持一致（距离由 tools/fit_views.py 二分求解）
    "front":   {"pos": (0, 5.05, -22.64), "look": (0, 0.95, 3),  "fov": 58},
    "front45": {"pos": (22.42, 14.28, -15.13), "look": (0, 1.2, 2), "fov": 52},
    "top":     {"pos": (0.03, 31.05, 3.83), "look": (0, 0.6, 2), "fov": 46},
    "left":    {"pos": (-22.28, 3.88, -0.78), "look": (-13, 1.1, 2), "fov": 56},
    "right":   {"pos": (22.36, 3.91, -0.81), "look": (13, 1.1, 2), "fov": 56},
    # 背视必须把相机放在背墙以内（墙面 z≈12.2），否则整面墙挡在镜头前；
    # 因此这里用超广角在近距离内装下整支乐队（fit_views.py 解出的 z=25.3 在墙外，不可用）。
    "back":    {"pos": (0, 9.5, 11.2), "look": (0, 1.0, -2), "fov": 100},
}


def sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def add(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def mul(a, s):
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
        self.f = norm(sub(look, pos))
        self.r = norm(cross(self.f, (0, 1, 0)))
        self.u = cross(self.r, self.f)
        self.t = math.tan(math.radians(fov) / 2)

    def project(self, p):
        d = sub(p, self.pos)
        z = dot(d, self.f)
        if z <= 0.01:
            return None
        x = dot(d, self.r) / (z * self.t * ASPECT)
        y = dot(d, self.u) / (z * self.t)
        return (x, y, z)          # NDC，范围 [-1,1] 内为可见


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


def frac(cam, pts):
    uv = [cam.project(p) for p in pts]
    if any(u is None for u in uv):
        return None
    xs = [u[0] for u in uv]
    ys = [u[1] for u in uv]
    w = (max(xs) - min(xs)) / 2
    h = (max(ys) - min(ys)) / 2
    return w, h, min(xs), max(xs), min(ys), max(ys)


def entities(models):
    """返回 [(id, size, x, z, yaw)]：乐器取自 models.json 实测尺寸（×SCALE），乐手取自 GLB 实测包围盒。"""
    out = []
    for mid, lay in LAYOUT.items():
        size = tuple(v * SCALE for v in models[mid]["metric"])
        out.append((mid, size, lay["x"], lay["z"], lay["yaw"]))
    for mid, lay in PERFORMERS.items():
        out.append((mid, PERFORMER_SIZE[mid], lay["x"], lay["z"], lay["yaw"]))
    return out


def main():
    with open(os.path.join(LAB, "models", "models.json"), encoding="utf-8") as f:
        models = {m["id"]: m for m in json.load(f)["models"]}
    ents = entities(models)

    print("%-9s %-8s %6s %6s %6s %6s  %s"
          % ("id", "view", "w%", "h%", "xmin", "ymin", "note"))
    bad = []
    for view, v in VIEWS.items():
        cam = Cam(v["pos"], v["look"], v["fov"])
        for mid, size, ex, ez, eyaw in ents:
            c = (ex, size[1] / 2, ez - CENTER_Z)
            r = frac(cam, corners(c, size, eyaw))
            if not r:
                print("%-9s %-8s  behind camera" % (mid, view))
                bad.append((mid, view, "在相机背后"))
                continue
            w, h, x0, x1, y0, y1 = r
            notes = []
            if x0 < -1 or x1 > 1 or y0 < -1 or y1 > 1:
                notes.append("出画")
                bad.append((mid, view, "出画"))
            print("%-9s %-8s %5.1f%% %5.1f%% %6.2f %6.2f  %s"
                  % (mid, view, w * 100, h * 100, x0, y0,
                     " ".join(notes) if notes else "ok"))

    print()
    # focus 机位单独算：与 band-lab.js 的 focusItem() 完全同一套算法
    # （对包围盒 8 角点做二分，求刚好全部落进 NDC ±FILL 的最近距离）
    print("── 单件特写 focus（同 focusItem()：角点二分、FILL=0.86）──")
    FILL = 0.86
    fov = 42.0
    d = norm((0.62, 0.42, -0.66))
    for mid, size, ex, ez, eyaw in ents:
        c = (ex, size[1] / 2, ez - CENTER_Z)
        pts = corners(c, size, eyaw)

        def fits(dist):
            cam = Cam(add(c, mul(d, dist)), c, fov)
            uv = [cam.project(p) for p in pts]
            if any(u is None for u in uv):
                return False
            # project() 的第三项是世界空间深度（不是 NDC 深度），只判 x/y 落框
            return all(abs(u[0]) <= FILL and abs(u[1]) <= FILL for u in uv)

        lo, hi = 0.4, 60.0
        for _ in range(28):
            mid_d = (lo + hi) / 2
            if fits(mid_d):
                hi = mid_d
            else:
                lo = mid_d
        dist = max(hi, 0.6)
        cam = Cam(add(c, mul(d, dist)), c, fov)
        w, h, x0, x1, y0, y1 = frac(cam, pts)
        notes = []
        if x0 < -1 or x1 > 1 or y0 < -1 or y1 > 1:
            notes.append("出画")
            bad.append((mid, "focus", "出画"))
        if max(w, h) < 0.6:
            notes.append("偏小")
            bad.append((mid, "focus", "偏小"))
        print("%-9s dist=%.2fm  w=%5.1f%% h=%5.1f%%  %s"
              % (mid, dist, w * 100, h * 100,
                 " ".join(notes) if notes else "ok"))

    print()
    if bad:
        print("需关注 %d 项：" % len(bad))
        for b in bad:
            print("   - %s @ %s : %s" % b)
        return 1
    print("取景检查通过：所有机位都完整框住乐器，无出画、特写无偏小。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

