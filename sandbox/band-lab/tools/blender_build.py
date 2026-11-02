# -*- coding: utf-8 -*-
"""
blender_build.py — 在 Blender 里批量生成 7 件乐器网格，出统计、渲染图与 GLB

用法（headless）：
    blender -b --factory-startup -P tools/blender_build.py -- [--no-render] [--ids drums keys]

产物：
    export/blender/<id>.glb        单件 GLB（真多边形，来源 Blender 原生导出器）
    export/blender/band_all.glb    七件按编制摆位合一的 GLB
    render/<id>_p1.png ...         四分之三视角 / 正视 / 侧视 三张 Cycles 渲染
    render/_band.png               全景渲染
    export/blender/stats.json      实测面数/顶点/材质数
"""
import json
import io
import math
import os
import sys

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import blender_voxel as BV  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
RENDER = os.path.join(LAB, 'render')
EXPORT = os.path.join(LAB, 'export', 'blender')

# 编制摆位：x = 相对舞台中轴偏移，z = 绝对纵深，yaw = 绕 Z 偏航（度，正数朝左转）
# 模型自身「正面」朝 -Y（观众侧），yaw 让每件略朝舞台中央
LAYOUT = {
    'drums':    dict(x=-11.5, z=107.0, yaw=10.0),
    'guitar':   dict(x=-15.0, z=100.5, yaw=18.0),
    'amp':      dict(x=-17.5, z=105.0, yaw=-16.0),
    'keys':     dict(x=12.0,  z=107.0, yaw=-10.0),
    'bass':     dict(x=15.0,  z=100.5, yaw=-18.0),
    'ampbass':  dict(x=17.5,  z=108.5, yaw=16.0),
}

# 用户明确「麦克风架不用」：体素麦克风架保留生成能力，但不进舞台编制、不进 band_all.glb。
# 乐手由 assets/crowd_a|crowd_b.glb 两位静态人模担任（在 band-lab.js 里单独加载）。
EXCLUDE = {'micstand'}


def argv_after_dash():
    return sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []


def setup_world(strength=0.45):
    world = bpy.data.worlds.new('W')
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.035, 0.045, 0.075, 1.0)
    bg.inputs[1].default_value = strength


def add_lights():
    # 主光：暖白，左前上方
    d = bpy.data.lights.new('key', 'AREA')
    d.energy = 900
    d.size = 6.0
    d.color = (1.0, 0.93, 0.85)
    o = bpy.data.objects.new('key', d)
    o.location = (-3.2, -4.2, 5.2)
    o.rotation_euler = (math.radians(52), 0, math.radians(-36))
    bpy.context.collection.objects.link(o)

    # 补光：冷蓝，右后
    d = bpy.data.lights.new('fill', 'AREA')
    d.energy = 380
    d.size = 7.0
    d.color = (0.62, 0.76, 1.0)
    o = bpy.data.objects.new('fill', d)
    o.location = (4.0, 3.6, 3.4)
    o.rotation_euler = (math.radians(72), 0, math.radians(150))
    bpy.context.collection.objects.link(o)

    # 轮廓光：背后的窄条
    d = bpy.data.lights.new('rim', 'AREA')
    d.energy = 500
    d.size = 3.0
    d.color = (0.45, 0.62, 1.0)
    o = bpy.data.objects.new('rim', d)
    o.location = (0.0, 5.5, 3.0)
    o.rotation_euler = (math.radians(96), 0, math.radians(180))
    bpy.context.collection.objects.link(o)


def add_floor(z=0.0, size=40.0):
    me = bpy.data.meshes.new('floor_mesh')
    s = size / 2
    me.from_pydata([(-s, -s, z), (s, -s, z), (s, s, z), (-s, s, z)], [], [(0, 1, 2, 3)])
    me.update()
    obj = bpy.data.objects.new('floor', me)
    bpy.context.collection.objects.link(obj)
    mat = bpy.data.materials.new('floor_mat')
    mat.use_nodes = True
    b = mat.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.018, 0.022, 0.032, 1.0)
    b.inputs['Roughness'].default_value = 0.42
    b.inputs['Metallic'].default_value = 0.25
    me.materials.append(mat)
    return obj


def make_camera(lens=62.0):
    cam = bpy.data.cameras.new('cam')
    cam.lens = lens
    o = bpy.data.objects.new('cam', cam)
    bpy.context.collection.objects.link(o)
    bpy.context.scene.camera = o
    return o


def place_camera(o, target, dist, azim_deg, elev_deg):
    """azim=0 时相机在目标的 +Y 侧（模型正面朝 +Y，所以这是「正面看」）。"""
    az, el = math.radians(azim_deg), math.radians(elev_deg)
    o.location = (
        target.x + dist * math.cos(el) * math.sin(az),
        target.y + dist * math.cos(el) * math.cos(az),
        target.z + dist * math.sin(el),
    )
    direction = target - o.location
    o.rotation_euler = direction.to_track_quat('-Z', 'Y').to_euler()
    bpy.context.view_layer.update()


def fit_camera(o, target, lo, hi, azim_deg, elev_deg, pad=0.055, iters=22):
    """二分搜索最近的相机距离，使 8 个包围盒角点都落在画面 [pad, 1-pad] 内。

    用 Blender 自己的 world_to_camera_view 做投影，正/侧/斜三种视角都能精确留白，
    避免「按包围球估距」在窄高件上撑满画面、在扁宽件上留白过多。
    """
    from bpy_extras.object_utils import world_to_camera_view

    corners = [Vector((x, y, z))
               for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
    scene = bpy.context.scene
    lo_d, hi_d = 0.6, 200.0
    best = hi_d
    for _ in range(iters):
        mid = (lo_d + hi_d) * 0.5
        place_camera(o, target, mid, azim_deg, elev_deg)
        fits = True
        for c in corners:
            p = world_to_camera_view(scene, o, c)
            if p.z <= 1e-4 or p.x < pad or p.x > 1.0 - pad or p.y < pad or p.y > 1.0 - pad:
                fits = False
                break
        if fits:
            best = mid
            hi_d = mid
        else:
            lo_d = mid
    place_camera(o, target, best, azim_deg, elev_deg)
    return best


def add_contact_disc(lo, hi):
    """单件渲染用：一块刚好托住模型的深色圆盘，给接触阴影又不占满画面。"""
    nx, ny = (hi.x - lo.x), (hi.y - lo.y)
    r = max(nx, ny) * 0.78 + 0.06
    bpy.ops.mesh.primitive_cylinder_add(vertices=56, radius=r, depth=0.012,
                                        location=(0.0, 0.0, lo.z + 0.006))
    o = bpy.context.object
    m = bpy.data.materials.new('disc_mat')
    m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (0.012, 0.016, 0.024, 1.0)
    b.inputs['Roughness'].default_value = 0.55
    o.data.materials.append(m)
    return o


def setup_render(w=1100, h=1100, samples=48):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.film_transparent = False
    sc.view_settings.view_transform = 'Filmic'
    sc.view_settings.look = 'None'


def bounds_of(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            for a in range(3):
                lo[a] = min(lo[a], p[a])
                hi[a] = max(hi[a], p[a])
    return lo, hi


def render_to(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def main():
    args = argv_after_dash()
    no_render = '--no-render' in args
    ids = [a for a in args if not a.startswith('--')]

    data = BV.load_models()
    # 默认剔除 EXCLUDE（micstand）：用户要求舞台上不要麦克风架。
    # 显式点名要它时（`-- micstand`）仍然可以单独生成，保留复用能力。
    models = [m for m in data['models']
              if (m['id'] in ids if ids else m['id'] not in EXCLUDE)]

    BV.clear_scene()
    setup_world()
    add_lights()
    floor = add_floor()
    setup_render()

    all_stats = []
    single_objs = {}
    for m in models:
        obj, st = BV.build_object(m, data)
        single_objs[m['id']] = obj
        all_stats.append(st)
        print('BUILD %-9s voxels=%-5d verts=%-6d quads=%-6d tris=%-6d colors=%d  尺寸 %s m'
              % (st['id'], st['voxels'], st['verts'], st['quads'], st['tris'],
                 st['colors'], 'x'.join('%.2f' % v for v in st['size_m'])))

    # 单件：渲染三视图 + 导出 GLB
    # 单件图用「深色接触圆盘」代替大地面，并可着整件取景，避免地面把画面填满、
    # 也避免按包围球估距造成窄高件撑满或扁宽件过小。
    if not no_render:
        cam = make_camera(62.0)
        floor.hide_render = True
        model_objs = set(single_objs.values())
        for m in models:
            obj = single_objs[m['id']]
            for o in model_objs:
                o.hide_render = (o is not obj)
            lo, hi = bounds_of([obj])
            center = (lo + hi) / 2.0
            center.z = lo.z + (hi.z - lo.z) * 0.48
            disc = add_contact_disc(lo, hi)
            shots = [(34, 20, 'p1', 0.075), (0, 11, 'front', 0.075), (88, 16, 'side', 0.075)]
            for az, el, tag, pad in shots:
                fit = fit_camera(cam, center, lo, hi, az, el, pad=pad)
                p = render_to(os.path.join(RENDER, '%s_%s.png' % (m['id'], tag)))
                print('RENDER %s dist=%.2f' % (p, fit))
            bpy.data.objects.remove(disc, do_unlink=True)
        for o in model_objs:
            o.hide_render = False
        floor.hide_render = False

    os.makedirs(EXPORT, exist_ok=True)
    for m in models:
        BV.clear_scene()
        setup_world(); add_lights(); add_floor(); setup_render()
        obj, _ = BV.build_object(m, data)
        p = BV.export_glb([obj], os.path.join(EXPORT, m['id'] + '.glb'))
        print('GLB %-9s %s  %d B' % (m['id'], p, os.path.getsize(p)))

    # 全景：按编制摆位放到一个场景里（x 为相对中轴偏移，z 为纵深）
    BV.clear_scene()
    setup_world(0.5); add_lights(); add_floor(); setup_render(w=1800, h=1000, samples=64)
    band = []
    for m in data['models']:
        if m['id'] in EXCLUDE:
            continue
        lay = LAYOUT.get(m['id'], dict(x=0.0, z=104.0, yaw=0.0))
        obj, _ = BV.build_object(m, data)
        obj.location = (lay['x'], lay['z'] - 104.0, 0.0)
        obj.rotation_euler = (0.0, 0.0, math.radians(lay['yaw']))
        band.append(obj)
    lo, hi = bounds_of(band)
    center = (lo + hi) / 2.0
    center.z = lo.z + (hi.z - lo.z) * 0.42
    cam = make_camera(52.0)
    fit_camera(cam, center, lo, hi, 20, 19, pad=0.045)
    p = render_to(os.path.join(RENDER, '_band.png'))
    print('RENDER', p)
    BV.export_glb(band, os.path.join(EXPORT, 'band_all.glb'))
    print('GLB band_all', os.path.getsize(os.path.join(EXPORT, 'band_all.glb')), 'B')

    with io.open(os.path.join(EXPORT, 'stats.json'), 'w', encoding='utf-8') as f:
        json.dump(all_stats, f, indent=1, ensure_ascii=False)
    tot = sum(s['tris'] for s in all_stats)
    totv = sum(s['verts'] for s in all_stats)
    print('TOTAL tris=%d verts=%d' % (tot, totv))


if __name__ == '__main__':
    main()
