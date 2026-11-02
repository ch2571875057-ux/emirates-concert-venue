# -*- coding: utf-8 -*-
"""
blender_voxel.py — 在 Blender 里把体素数据（models/models.json）生成真实网格

与沙盒里的 Three.js 程序化路线互补：这里输出的是**真正的多边形模型**，
可由 Blender 原生 glTF 导出器产出 GLB（项目 vendor 里没有 GLTFExporter）。

关键设计
--------
* 只生成**暴露面**（邻居为空的 6 个方向），内部面全部剔除；
* 每个颜色分组做**贪心矩形合并**（greedy meshing），大幅减少面数，
  同时保持硬边方块外观不变；
* 面向正确性靠显式计算绕序（不依赖 recalc_normals，因为按色拆分的
  子网格不是闭合体，recalc 会翻错面）；
* 坐标映射：体素 (i, j, k) →
    blender_x = i * V                 （模型自身左右）
    blender_y = (nz-1-k) * V          （k=0 为「正面」，映射到 +Y）
    blender_z = j * V                 （j=0 为地面）
  Blender Z-up 导出 glTF 时 (x,y,z)→(x,z,-y)，因此正面最终落在 glTF 的 -Z，
  与主项目「舞台朝 -z、观众在 -z 侧」的朝向一致。
* 原点归到底面中心，单位 = 1 米。
"""
import json
import io
import math
import os

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
MODELS = os.path.join(LAB, 'models')


# ---------------------------------------------------------------- 基础工具
def srgb_to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex2linear(h):
    h = h.lstrip('#')
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    return (srgb_to_linear(r), srgb_to_linear(g), srgb_to_linear(b), 1.0)


def load_models():
    with io.open(os.path.join(MODELS, 'models.json'), encoding='utf-8') as f:
        return json.load(f)


def cells_of(m):
    """{(i,j,k): char}"""
    out = {}
    for j, layer in enumerate(m['layers']):
        for k, row in enumerate(layer):
            for i, ch in enumerate(row):
                if ch != '.':
                    out[(i, j, k)] = ch
    return out


def exposed_faces(cells):
    """按 (axis, sign, layer) 收集有暴露面的 (u, v) 单元。"""
    faces = {}
    for (i, j, k) in cells:
        for axis, sign in ((0, -1), (0, 1), (1, -1), (1, 1), (2, -1), (2, 1)):
            nb = [i, j, k]
            nb[axis] += sign
            if tuple(nb) in cells:
                continue
            layer = (i, j, k)[axis]
            if axis == 0:
                u, v = k, j
            elif axis == 1:
                u, v = i, k
            else:
                u, v = i, j
            faces.setdefault((axis, sign, layer), set()).add((u, v))
    return faces


def greedy_rects(cells2d):
    """把同层同法线的 2D 单元集合合并成矩形 [(u0, v0, w, h)]。"""
    remaining = set(cells2d)
    rects = []
    for (u0, v0) in sorted(remaining):
        if (u0, v0) not in remaining:
            continue
        # 先向 +u 扩展
        w = 0
        while (u0 + w, v0) in remaining:
            w += 1
        # 再向 +v 扩展，要求整行都在
        h = 1
        while True:
            row = [(u0 + x, v0 + h) for x in range(w)]
            if all(p in remaining for p in row):
                h += 1
            else:
                break
        for x in range(w):
            for y in range(h):
                remaining.discard((u0 + x, v0 + y))
        rects.append((u0, v0, w, h))
    return rects


def face_quad(axis, sign, layer, u0, v0, w, h, V):
    """返回 4 个顶点（米），按「中间空间」排布：x=i*V, y=k*V, z=j*V。

    - axis 0（i，即 X 平面）：u=k→y, v=j→z
    - axis 1（j，即 Z 平面）：u=i→x, v=k→y
    - axis 2（k，即 Y 平面）：u=i→x, v=j→z
    绕序保证法线朝外（各分支的基础绕序已在注释里标出，flip 只在需要时反转），
    因为按颜色拆分的子网格不闭合，不能依赖 recalc_normals 兜底。
    """
    b = (layer + (1 if sign > 0 else 0)) * V  # 面所在平面坐标
    u0m, u1m = u0 * V, (u0 + w) * V
    v0m, v1m = v0 * V, (v0 + h) * V

    if axis == 0:      # X 平面；u→y, v→z；基础绕序法线 +X
        pts = [(b, u0m, v0m), (b, u1m, v0m), (b, u1m, v1m), (b, u0m, v1m)]
        flip = sign < 0
    elif axis == 1:    # Z 平面；u→x, v→y；基础绕序法线 +Z
        pts = [(u0m, v0m, b), (u1m, v0m, b), (u1m, v1m, b), (u0m, v1m, b)]
        flip = sign < 0
    else:              # Y 平面；u→x, v→z；基础绕序法线 -Y
        pts = [(u0m, b, v0m), (u1m, b, v0m), (u1m, b, v1m), (u0m, b, v1m)]
        flip = sign > 0
    if flip:
        pts = pts[::-1]
    return pts


# ---------------------------------------------------------------- 材质
def make_material(name, hexcolor, rough=0.55, metal=0.0):
    mat = bpy.data.materials.get(name)
    if mat:
        return mat
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    col = hex2linear(hexcolor)
    bsdf.inputs['Base Color'].default_value = col
    bsdf.inputs['Roughness'].default_value = rough
    bsdf.inputs['Metallic'].default_value = metal
    if 'Specular IOR Level' in bsdf.inputs:
        bsdf.inputs['Specular IOR Level'].default_value = 0.35
    mat.diffuse_color = col
    return mat


# 材质手感：不同色号给不同粗糙度/金属度，让渲染有材质区分
MAT_TUNING = {
    'K': (0.42, 0.0),   # 炭黑（漆面）
    'N': (0.55, 0.0),
    'G': (0.50, 0.35),  # 深灰金属支架
    'M': (0.42, 0.55),  # 中灰金属
    'C': (0.28, 0.85),  # 亮银镀铬
    'W': (0.55, 0.0),
    'B': (0.35, 0.0),
    'Y': (0.30, 0.80),  # 黄铜镲片
    'T': (0.62, 0.0),   # 木色
    'O': (0.58, 0.0),   # 枫木指板
    'S': (0.68, 0.0),   # 深棕木
    'R': (0.38, 0.0),   # 红
    'A': (0.82, 0.0),   # 音箱网布
}


# ---------------------------------------------------------------- 构建
def build_object(m, data, name=None, offset=(0.0, 0.0, 0.0)):
    """把一个模型做成单个 mesh 对象（多材质槽），返回 (obj, stats)。"""
    V = m['voxel']
    nx, ny, nz = m['size']
    cells = cells_of(m)
    pal = data['palette']

    # 先在「整块」上求暴露面（这样不同色块之间的内部隔墙会被剔除），
    # 再按所属体素的色号分组做贪心合并 —— 单件 1 个 mesh、每色 1 个材质槽。
    by_color = {}
    for (i, j, k), ch in cells.items():
        for axis, sign in ((0, -1), (0, 1), (1, -1), (1, 1), (2, -1), (2, 1)):
            nb = [i, j, k]
            nb[axis] += sign
            if tuple(nb) in cells:
                continue
            layer = (i, j, k)[axis]
            if axis == 0:
                u, v = k, j
            elif axis == 1:
                u, v = i, k
            else:
                u, v = i, j
            key = (axis, sign, layer)
            slot2 = by_color.setdefault(ch, {})
            slot2.setdefault(key, set()).add((u, v))

    verts, faces, mat_idx = [], [], []
    slot_of = {}
    for ch in sorted(by_color):
        if ch not in slot_of:
            slot_of[ch] = len(slot_of)
        slot = slot_of[ch]
        for (axis, sign, layer), c2 in sorted(by_color[ch].items()):
            for (u0, v0, w, h) in greedy_rects(c2):
                quad = face_quad(axis, sign, layer, u0, v0, w, h, V)
                base = len(verts)
                verts.extend(quad)
                faces.append((base, base + 1, base + 2, base + 3))
                mat_idx.append(slot)

    # 坐标映射到 Blender：x=i*V, y=(nz-1-k)*V（k=0 为正面→+Y）, z=j*V
    mapped = []
    for (x, y, z) in verts:
        mapped.append((x, (nz - 1) * V - y, z))

    # 映射后若整体绕序反了（带符号体积为负），统一翻转，保证法线朝外
    vol = 0.0
    for f in faces:
        a, b, c = (mapped[f[0]], mapped[f[1]], mapped[f[2]])
        vol += (a[0] * (b[1] * c[2] - b[2] * c[1])
                - a[1] * (b[0] * c[2] - b[2] * c[0])
                + a[2] * (b[0] * c[1] - b[1] * c[0])) / 6.0
    if vol < 0:
        faces = [tuple(reversed(f)) for f in faces]
    xs = [p[0] for p in mapped]
    ys = [p[1] for p in mapped]
    zs = [p[2] for p in mapped]
    cx = (min(xs) + max(xs)) / 2.0
    cy = (min(ys) + max(ys)) / 2.0
    zmin = min(zs)
    mapped = [(x - cx + offset[0], y - cy + offset[1], z - zmin + offset[2])
              for (x, y, z) in mapped]

    me = bpy.data.meshes.new((name or m['id']) + '_mesh')
    me.from_pydata(mapped, [], faces)
    me.update()
    me.validate(verbose=False)
    for poly, si in zip(me.polygons, mat_idx):
        poly.material_index = si
        poly.use_smooth = False

    obj = bpy.data.objects.new(name or m['id'], me)
    bpy.context.collection.objects.link(obj)

    # 材质槽
    for ch in sorted(slot_of):
        r, mt = MAT_TUNING.get(ch, (0.5, 0.0))
        me.materials.append(make_material('pal_' + ch, pal[ch], r, mt))

    stats = {
        'id': m['id'],
        'name': m['name'],
        'voxels': len(cells),
        'verts': len(mapped),
        'quads': len(faces),
        'tris': len(faces) * 2,
        'colors': len(slot_of),
        'size_m': [round(v * V, 3) for v in (nx, ny, nz)],
    }
    return obj, stats


def clear_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def export_glb(objs, path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        use_selection=True,
        export_apply=True,
        export_yup=True,
        export_materials='EXPORT',
    )
    return path
