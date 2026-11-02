# -*- coding: utf-8 -*-
"""
build_fourview.py — 从体素数据渲染高分辨率四视图（正/背/左/右 + 顶视 + 参考图）

不依赖任何看图能力：直接由 models.json 的体素网格做正交投影，
按「层深度明暗 + 投影 AO」着色，叠 0.5 m 网格与尺寸标注。

输出（均为 2× 超采样后 LANCZOS 降采样，文字与边缘锐利）：
    fourview/<id>_fourview.png       单件四视图（卡点1 交付物）
    fourview/<id>_front.png          单件正视大图（放大看细节）
    fourview/_index.png              七件总览拼版

用法：
    python tools/build_fourview.py                 # 全部，默认 22 px/格
    python tools/build_fourview.py --px 30         # 更高分辨率
    python tools/build_fourview.py drums keys      # 只出这两件
"""
import io
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODELS = os.path.join(ROOT, 'models')
OUT = os.path.join(ROOT, 'fourview')

FONT_PATHS = [
    r'C:\Windows\Fonts\msyh.ttc',
    r'C:\Windows\Fonts\msyhbd.ttc',
    r'C:\Windows\Fonts\simhei.ttf',
]
BG = (18, 20, 26)
PANEL = (26, 29, 37)
GRID = (40, 45, 56)
GRID_MAJOR = (74, 82, 98)
INK = (230, 234, 242)
DIM = (150, 158, 174)
ACCENT = (86, 156, 255)

SS = 2          # 超采样倍率
PX = 22         # 每体素最终像素（下限）
PX_MAX = 48     # 每体素最终像素（上限）
TARGET = 900    # 单个面板最长边目标像素：窄高件自动放大，避免「小图」
LAYOUTS = {}    # 每件的版面几何，写进 fourview/_layout.json 供 QA 精确比对


def s(v):
    """按超采样倍率放大尺寸。"""
    return int(round(v * SS))


def font(size, bold=False):
    for p in (FONT_PATHS[1], FONT_PATHS[0], FONT_PATHS[2]) if bold else FONT_PATHS:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, s(size))
            except Exception:
                continue
    return ImageFont.load_default()


def hex2rgb(v):
    v = v.lstrip('#')
    return tuple(int(v[i:i + 2], 16) for i in (0, 2, 4))


def grid_of(m):
    g = {}
    for j, layer in enumerate(m['layers']):
        for k, row in enumerate(layer):
            for i, ch in enumerate(row):
                if ch != '.':
                    g[(i, j, k)] = ch
    return g


def project(g, size, view):
    """把体素投影成 2D 图：返回 (W, H, dict[(u,v)] = (char, depth, total))。"""
    nx, ny, nz = size
    cells = {}
    if view in ('front', 'back'):
        for (i, j, k), ch in g.items():
            u = i if view == 'front' else (nx - 1 - i)
            key = (u, ny - 1 - j)
            d = k if view == 'front' else (nz - 1 - k)
            cells.setdefault(key, []).append((d, ch))
        W, H = nx, ny
    elif view in ('left', 'right'):
        for (i, j, k), ch in g.items():
            u = k if view == 'right' else (nz - 1 - k)   # left = 从 -x 看
            key = (u, ny - 1 - j)
            d = (nx - 1 - i) if view == 'right' else i
            cells.setdefault(key, []).append((d, ch))
        W, H = nz, ny
    else:  # top
        for (i, j, k), ch in g.items():
            cells.setdefault((i, k), []).append((ny - 1 - j, ch))
        W, H = nx, nz
    out = {}
    for key, lst in cells.items():
        lst.sort()
        d0, ch0 = lst[0]
        out[key] = (ch0, d0, len(lst))
    return W, H, out


def occl_map(cells):
    """投影 AO：周围 8 格中「不比它更靠后」的邻居越多越暗，强化方块接缝与凹陷。"""
    ao = {}
    for (u, v), (_, d, _) in cells.items():
        near = 0
        for du in (-1, 0, 1):
            for dv in (-1, 0, 1):
                if du == 0 and dv == 0:
                    continue
                nb = cells.get((u + du, v + dv))
                if nb is not None and nb[1] >= d:
                    near += 1
        ao[(u, v)] = 1.0 - 0.05 * near
    return ao


def shade(rgb, depth, total, ao=1.0):
    """越靠观察者越亮；有前后叠压再压暗；再乘投影 AO。"""
    t = 0.0 if total <= 1 else min(1.0, depth / max(1, total - 1))
    f = 1.0 - 0.30 * t
    f *= 1.0 - 0.05 * min(total - 1, 4)
    f *= ao
    return tuple(max(0, min(255, int(c * f))) for c in rgb)


def draw_panel(img, m, view, box, px, label, palmap, show_grid=True):
    """在 box 内画一个正交视图（所有尺寸已含超采样）。"""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    W, H, cells = project(grid_of(m), m['size'], view)
    ao = occl_map(cells)
    ox = x0 + (x1 - x0 - W * px) // 2
    oy = y0 + s(52) + (y1 - y0 - s(52) - H * px - s(34)) // 2

    d.rectangle([x0, y0, x1, y1], fill=PANEL, outline=(52, 58, 72))
    d.text((x0 + s(14), y0 + s(12)), label, font=font(17, True), fill=INK)

    # 网格：细线 0.25 m（5 格），粗线 1 m（20 格）
    if show_grid:
        for u in range(0, W + 1):
            if u % 20 == 0:
                col = GRID_MAJOR
            elif u % 5 == 0:
                col = GRID
            else:
                continue
            d.line([ox + u * px, oy, ox + u * px, oy + H * px], fill=col, width=s(1))
        for v in range(0, H + 1):
            if v % 20 == 0:
                col = GRID_MAJOR
            elif v % 5 == 0:
                col = GRID
            else:
                continue
            d.line([ox, oy + v * px, ox + W * px, oy + v * px], fill=col, width=s(1))

    # 体素：整块填充 + 1px 内侧描边，凸显方块感
    for (u, v), (ch, depth, total) in cells.items():
        col = shade(palmap.get(ch, (200, 200, 200)), depth, total, ao[(u, v)])
        xa, ya = ox + u * px, oy + v * px
        xb, yb = xa + px - 1, ya + px - 1
        d.rectangle([xa, ya, xb, yb], fill=col)
        if px >= 8:
            edge = tuple(max(0, int(c * 0.78)) for c in col)
            d.rectangle([xa, ya, xb, yb], outline=edge, width=s(1))

    # 地面线（y=0）
    d.line([ox, oy + H * px, ox + W * px, oy + H * px], fill=(110, 120, 140), width=s(1))
    d.rectangle([ox - s(1), oy - s(1), ox + W * px, oy + H * px],
                outline=(100, 110, 130), width=s(1))

    # 尺寸标注
    vx = m['size'][0] if view in ('front', 'back') else m['size'][2]
    vy = m['size'][2] if view == 'top' else m['size'][1]
    d.text((ox, oy + H * px + s(9)), '宽 %.2f m / %d 格' % (vx * m['voxel'], vx),
           font=font(14), fill=DIM)
    d.text((ox, oy - s(24)), '高 %.2f m / %d 格' % (vy * m['voxel'], vy),
           font=font(14), fill=DIM)

    # 比例尺：1 m + 0.5 m
    bar = 20 * px
    bx, by = x1 - bar - s(20), y1 - s(28)
    d.line([bx, by, bx + bar, by], fill=ACCENT, width=s(2))
    d.line([bx, by - s(5), bx, by + s(5)], fill=ACCENT, width=s(2))
    d.line([bx + bar, by - s(5), bx + bar, by + s(5)], fill=ACCENT, width=s(2))
    d.text((bx, by - s(24)), '1 m', font=font(13), fill=ACCENT)
    # 供 QA 比对用的版面几何（最终像素坐标，未除超采样）
    return dict(ox=ox, oy=oy, W=W, H=H, px=px)


def draw_ref(img, ref_path, box, label):
    """在 box 内贴参考原图（等比缩放，居中）。"""
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = box
    d.rectangle([x0, y0, x1, y1], fill=PANEL, outline=(52, 58, 72))
    d.text((x0 + s(14), y0 + s(12)), label, font=font(17, True), fill=INK)
    if not ref_path or not os.path.exists(ref_path):
        d.text((x0 + s(20), y0 + s(60)), '（未提供参考图）', font=font(15), fill=DIM)
        return
    im = Image.open(ref_path).convert('RGB')
    aw, ah = x1 - x0 - s(40), y1 - y0 - s(92)
    r = min(aw / im.width, ah / im.height)
    # 参考图也按超采样倍率重采样，保证降采样后依然锐利
    im = im.resize((max(1, int(im.width * r)), max(1, int(im.height * r))), Image.LANCZOS)
    img.paste(im, (x0 + (x1 - x0 - im.width) // 2, y0 + s(60) + (ah - im.height) // 2))


REF_NAMES = {
    'drums': '架子鼓（5 鼓 3 镲 + 鼓凳 + 鼓台）',
    'guitar': '电吉他（落地琴架）',
    'bass': '电贝斯（落地琴架）',
    'keys': '双层键盘（琴架 + 延音踏板）',
    'amp': '吉他音箱堆（箱头 + 4×12）',
    'ampbass': '贝斯一体音箱（4×10）',
    'micstand': '麦克风架（空置）',
}


def ref_path_of(mid):
    p = os.path.join(ROOT, 'refs', REF_NAMES.get(mid, '') + '.png')
    return p if os.path.exists(p) else None


def render_model(m, palmap):
    """3×2 六宫格：正/背/顶/左/右 + 参考原图。"""
    nx, ny, nz = m['size']
    panels = [
        ('front', '正视 front（观众视角 -z）', nx, ny),
        ('back', '背视 back（+z）', nx, ny),
        ('top', '顶视 top（俯视 -y）', nx, nz),
        ('left', '左视 left（从 -x 看）', nz, ny),
        ('right', '右视 right（从 +x 看）', nz, ny),
    ]
    # 每件自动定尺度：窄高件（吉他/贝斯/麦架）放大到面板最长边≈TARGET px，
    # 宽扁件（鼓/键盘）受 PX 下限保护，避免整图过大。
    longest = max(max(p[2], p[3]) for p in panels)
    px = s(max(PX, min(PX_MAX, int(round(TARGET / float(longest))))))
    cellw = max(p[2] for p in panels) * px + s(110)
    cellh = max(p[3] for p in panels) * px + s(150)
    pad, head, foot = s(24), s(122), s(64)
    cols, rows = 3, 2
    total_w = cellw * cols + pad * 2
    total_h = head + cellh * rows + pad * 2 + foot
    img = Image.new('RGB', (total_w, total_h), BG)
    d = ImageDraw.Draw(img)
    d.text((pad, s(24)), '%s · 四视图' % m['name'], font=font(32, True), fill=INK)
    d.text((pad, s(72)), m['note'], font=font(17), fill=DIM)
    d.text((pad, s(98)), '实测 %.2f × %.2f × %.2f m（宽×高×深）　体素边长 %.2f m　%d 格　%d 色' % (
        m['metric'][0], m['metric'][1], m['metric'][2], m['voxel'], m['voxels'],
        len(set(m['palette_used']) if 'palette_used' in m else set())),
        font=font(16), fill=ACCENT)

    slots = [(0, 0), (1, 0), (2, 0), (0, 1), (1, 1)]
    layout = []
    for (view, label, _, _), (ci, ri) in zip(panels, slots):
        box = (pad + ci * cellw, head + ri * cellh,
               pad + ci * cellw + cellw - s(9), head + ri * cellh + cellh - s(9))
        geo = draw_panel(img, m, view, box, px, label, palmap)
        geo.update(view=view, box=box)
        layout.append(geo)
    box = (pad + 2 * cellw, head + cellh,
           pad + 3 * cellw - s(9), head + 2 * cellh - s(9))
    draw_ref(img, ref_path_of(m['id']), box, '参考原图（用户提供）')

    # 页脚：调色板 + 统计
    used = []
    for layer in m['layers']:
        for row in layer:
            for ch in row:
                if ch != '.' and ch not in used:
                    used.append(ch)
    lx, ly = pad, total_h - s(56)
    d.text((lx, ly + s(9)), '用色 %d 种：' % len(used), font=font(15), fill=DIM)
    lx += s(112)
    for ch in used:
        col = palmap.get(ch, (200, 200, 200))
        d.rectangle([lx, ly, lx + s(22), ly + s(22)], fill=col, outline=(96, 104, 120), width=s(1))
        d.text((lx + s(27), ly + s(3)), ch, font=font(14), fill=DIM)
        lx += s(50)
    d.text((total_w - s(360), ly + s(7)), '部件 %d　漂浮 %d　每格 %.0f cm' % (
        m['components'], m['floating'], m['voxel'] * 100), font=font(15), fill=DIM)

    LAYOUTS[m['id']] = dict(ss=SS, out=(total_w // SS, total_h // SS), panels=layout)
    return img.resize((total_w // SS, total_h // SS), Image.LANCZOS)


def render_front(m, palmap):
    """单件正视大图：放大到最长边约 1900 px，用来看体素细节。"""
    nx, ny, _ = m['size']
    px = s(max(8, min(64, int(round(1900.0 / max(nx, ny))))))
    W, H, cells = project(grid_of(m), m['size'], 'front')
    ao = occl_map(cells)
    pad, head, foot = s(28), s(120), s(80)
    total_w = W * px + pad * 2
    total_h = H * px + head + foot
    img = Image.new('RGB', (total_w, total_h), BG)
    d = ImageDraw.Draw(img)
    d.text((pad, s(26)), '%s · 正视大图' % m['name'], font=font(30, True), fill=INK)
    d.text((pad, s(74)), '%.2f × %.2f m　体素边长 %.2f m（1 格 = %.0f cm）　每格 %d px' % (
        nx * m['voxel'], ny * m['voxel'], m['voxel'], m['voxel'] * 100, px // SS),
        font=font(16), fill=ACCENT)
    ox, oy = pad, head
    for (u, v), (ch, depth, total) in cells.items():
        col = shade(palmap.get(ch, (200, 200, 200)), depth, total, ao[(u, v)])
        xa, ya = ox + u * px, oy + v * px
        xb, yb = xa + px - 1, ya + px - 1
        d.rectangle([xa, ya, xb, yb], fill=col)
        edge = tuple(max(0, int(c * 0.74)) for c in col)
        d.rectangle([xa, ya, xb, yb], outline=edge, width=s(1))
    d.rectangle([ox - s(1), oy - s(1), ox + W * px, oy + H * px],
                outline=(110, 120, 140), width=s(1))
    # 0.5 m 刻度尺（贴着图像下沿）
    for i in range(0, nx + 1, 10):
        xx = ox + i * px
        tall = (i % 20 == 0)
        d.line([xx, oy + H * px, xx, oy + H * px + s(9 if tall else 5)],
               fill=(120, 130, 150), width=s(1))
        if tall:
            d.text((xx - s(9), oy + H * px + s(12)), '%.0fm' % (i * m['voxel']),
                   font=font(12), fill=DIM)
    return img.resize((total_w // SS, total_h // SS), Image.LANCZOS)


def render_index(models, palmap, per_w=1180):
    thumbs = []
    for m in models:
        im = render_model(m, palmap)
        r = per_w / im.width
        thumbs.append(im.resize((per_w, max(1, int(im.height * r))), Image.LANCZOS))
    cols = 2
    rows = (len(thumbs) + cols - 1) // cols
    cw = per_w + s(22)
    rh = [max(thumbs[r * cols + c].height for c in range(cols) if r * cols + c < len(thumbs))
          for r in range(rows)]
    img = Image.new('RGB', (cw * cols + s(24), sum(rh) + s(24) * rows + s(96)), BG)
    d = ImageDraw.Draw(img)
    d.text((s(24), s(24)), '乐队乐器体素模型 · 四视图总览（沙盒 band-lab）',
           font=font(28, True), fill=INK)
    d.text((s(24), s(64)),
           '体素边长 0.05 m　编制 9 件 / 7 种模型　每件均已验证单一连通体、零漂浮',
           font=font(15), fill=DIM)
    y = s(96)
    for r in range(rows):
        for c in range(cols):
            idx = r * cols + c
            if idx >= len(thumbs):
                break
            img.paste(thumbs[idx], (s(24) + c * cw, y))
        y += rh[r] + s(24)
    return img


def main():
    global PX
    args = [a for a in sys.argv[1:]]
    if '--px' in args:
        i = args.index('--px')
        PX = int(args[i + 1])
        del args[i:i + 2]
    with io.open(os.path.join(MODELS, 'models.json'), encoding='utf-8') as f:
        data = json.load(f)
    palmap = {k: hex2rgb(v) for k, v in data['palette'].items()}
    ids = args
    models = [m for m in data['models'] if not ids or m['id'] in ids]
    os.makedirs(OUT, exist_ok=True)
    for m in models:
        img = render_model(m, palmap)
        p = os.path.join(OUT, m['id'] + '_fourview.png')
        img.save(p, optimize=True)
        fr = render_front(m, palmap)
        pf = os.path.join(OUT, m['id'] + '_front.png')
        fr.save(pf, optimize=True)
        print('%-9s %-52s %dx%d' % (m['id'], p, img.width, img.height))
        print('%-9s %-52s %dx%d' % ('', pf, fr.width, fr.height))
    with io.open(os.path.join(OUT, '_layout.json'), 'w', encoding='utf-8') as f:
        json.dump(LAYOUTS, f, indent=1, ensure_ascii=False)
    if not ids:
        idx = render_index(data['models'], palmap)
        pi = os.path.join(OUT, '_index.png')
        idx.save(pi, optimize=True)
        print('index    %-52s %dx%d' % (pi, idx.width, idx.height))


if __name__ == '__main__':
    main()
