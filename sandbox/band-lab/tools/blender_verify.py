# -*- coding: utf-8 -*-
"""
blender_verify.py — 回读导出的 GLB 做校验（不信任导出结果本身）

对每个 export/blender/<id>.glb：
  * 重新 import 进空场景
  * 报告对象数、三角面数、顶点数、材质数、包围盒尺寸
  * 与 models/models.json 的解析结果、以及 export/blender/stats.json 交叉比对
  * 检查包围盒是否与设计尺寸一致（±0.06 m，只允许贪心合并带来的极小误差）
  * 检查每个面的法线朝向（GLB 里三角顺序是否自洽：用 signed volume 判断）
退出码 0 = 全部通过。
"""
import glob
import io
import json
import os
import sys

import bpy
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
EXPORT = os.path.join(LAB, 'export', 'blender')
MODELS = os.path.join(LAB, 'models')


def bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for o in objs:
        if o.type != 'MESH':
            continue
        for c in o.bound_box:
            p = o.matrix_world @ Vector(c)
            for a in range(3):
                lo[a] = min(lo[a], p[a])
                hi[a] = max(hi[a], p[a])
    return lo, hi


def signed_volume(obj):
    """对所有三角面求带符号体积和：闭合/一致朝外的网格应为正。"""
    me = obj.data
    me.calc_loop_triangles()
    v = 0.0
    for tri in me.loop_triangles:
        a, b, c = (me.vertices[i].co for i in tri.vertices)
        v += a.dot(b.cross(c)) / 6.0
    return v


def main():
    with io.open(os.path.join(MODELS, 'models.json'), encoding='utf-8') as f:
        data = json.load(f)
    want = {m['id']: m for m in data['models']}
    with io.open(os.path.join(EXPORT, 'stats.json'), encoding='utf-8') as f:
        stats = {s['id']: s for s in json.load(f)}

    bad = []
    print('%-9s %-9s %-9s %-7s %-24s %s' % ('id', 'tris', 'verts', 'mats', 'bbox (m, glTF Y-up)', '体积'))
    for p in sorted(glob.glob(os.path.join(EXPORT, '*.glb'))):
        mid = os.path.splitext(os.path.basename(p))[0]
        if mid not in want:
            continue
        bpy.ops.wm.read_factory_settings(use_empty=True)
        bpy.ops.import_scene.gltf(filepath=p)
        objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        if not objs:
            bad.append('%s: 导入后没有 mesh 对象' % mid)
            continue
        tris = 0
        verts = 0
        mats = set()
        for o in objs:
            o.data.calc_loop_triangles()
            tris += len(o.data.loop_triangles)
            verts += len(o.data.vertices)
            for ms in o.material_slots:
                if ms.material:
                    mats.add(ms.material.name)
        lo, hi = bbox(objs)
        dims = (hi.x - lo.x, hi.y - lo.y, hi.z - lo.z)
        # GLB 是 Y-up，但 import_scene.gltf 会再转回 Blender 的 Z-up，
        # 所以这里的尺寸是 (nx, nz, ny)，与 models.json 的 size=(nx,ny,nz) 需换序比较。
        m = want[mid]
        V = m['voxel']
        exp = (m['size'][0] * V, m['size'][1] * V, m['size'][2] * V)
        exp_yup = (exp[0], exp[2], exp[1])
        ok_dim = all(abs(dims[i] - exp_yup[i]) < 0.06 for i in range(3))
        vol = sum(signed_volume(o) for o in objs)
        ok_vol = vol > 0
        st = stats.get(mid, {})
        ok_stat = st.get('tris') == tris
        tag = []
        if not ok_dim:
            tag.append('尺寸不符 期望 %.2fx%.2fx%.2f' % exp_yup)
            bad.append('%s: bbox %.2fx%.2fx%.2f 期望 %.2fx%.2fx%.2f'
                       % ((mid,) + dims + exp_yup))
        if not ok_vol:
            tag.append('法线朝向异常')
            bad.append('%s: 带符号体积 %.4f <= 0（面朝向不自洽）' % (mid, vol))
        if not ok_stat:
            tag.append('与 stats.json 三角数不一致(%s)' % st.get('tris'))
            bad.append('%s: 回读 tris=%d，stats.json=%s' % (mid, tris, st.get('tris')))
        print('%-9s %-9d %-9d %-7d %-24s %.4f %s' % (
            mid, tris, verts, len(mats),
            '%.2f x %.2f x %.2f' % dims, vol, ' '.join(tag)))
    print()
    if bad:
        print('问题 %d 条：' % len(bad))
        for b in bad:
            print('  -', b)
        sys.exit(1)
    print('全部通过：GLB 回读尺寸、面朝向、三角数与源数据一致。')


if __name__ == '__main__':
    main()
