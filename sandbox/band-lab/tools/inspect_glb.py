# -*- coding: utf-8 -*-
"""检查 GLB 的结构：节点、网格、包围盒、骨骼/动画、材质。

只读，不改任何文件。用法：
    python tools/inspect_glb.py <a.glb> [b.glb ...]
"""
import json
import os
import struct
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')


def load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    magic, version, length = struct.unpack_from('<III', data, 0)
    assert magic == 0x46546C67, 'not a GLB: %s' % path
    off = 12
    js = None
    bin_chunk = None
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            bin_chunk = chunk
        off += 8 + clen + ((4 - clen % 4) % 4 if clen % 4 else 0)
    return js, bin_chunk


def node_world_scale(nodes, idx, parent=(1.0, 1.0, 1.0), depth=0):
    n = nodes[idx]
    s = n.get('scale', [1, 1, 1])
    comb = tuple(parent[i] * s[i] for i in range(3))
    return comb


def report(path):
    js, binc = load_glb(path)
    print('=' * 70)
    print('%s   %.1f KB' % (os.path.basename(path), os.path.getsize(path) / 1024))
    print('  generator:', js.get('asset', {}).get('generator'))
    print('  scenes=%d nodes=%d meshes=%d materials=%d skins=%d animations=%d'
          % (len(js.get('scenes', [])), len(js.get('nodes', [])),
             len(js.get('meshes', [])), len(js.get('materials', [])),
             len(js.get('skins', [])), len(js.get('animations', []))))

    # 动画名
    for i, a in enumerate(js.get('animations', [])):
        print('  anim[%d] %r channels=%d' % (i, a.get('name'), len(a.get('channels', []))))

    # 根节点
    scene = js.get('scenes', [{}])[js.get('scene', 0)]
    print('  根节点:', scene.get('nodes'))

    # 全局包围盒（用 accessor min/max，忽略节点变换，仅作量级参考）
    lo = [1e9] * 3
    hi = [-1e9] * 3
    for ai, acc in enumerate(js.get('accessors', [])):
        if acc.get('type') != 'VEC3' or 'min' not in acc or 'max' not in acc:
            continue
        # 只取 POSITION 用到的 accessor
        used = False
        for m in js.get('meshes', []):
            for p in m.get('primitives', []):
                if p.get('attributes', {}).get('POSITION') == ai:
                    used = True
        if not used:
            continue
        for i in range(3):
            lo[i] = min(lo[i], acc['min'][i])
            hi[i] = max(hi[i], acc['max'][i])
    if lo[0] < 1e8:
        print('  原始包围盒 min=(%.4f, %.4f, %.4f) max=(%.4f, %.4f, %.4f)'
              % (*lo, *hi))
        print('  尺寸  x=%.4f y=%.4f z=%.4f' % (hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]))

    # 节点树（最多 40 个）
    nodes = js.get('nodes', [])
    roots = scene.get('nodes', [])

    def walk(idx, depth):
        if depth > 5:
            return
        n = nodes[idx]
        info = []
        if 'mesh' in n:
            info.append('mesh=%d' % n['mesh'])
        if 'skin' in n:
            info.append('skin=%d' % n['skin'])
        if 'scale' in n:
            info.append('scale=%s' % [round(v, 4) for v in n['scale']])
        if 'translation' in n:
            info.append('t=%s' % [round(v, 4) for v in n['translation']])
        print('   ' + '  ' * depth + '- [%d] %r %s'
              % (idx, n.get('name', ''), ' '.join(info)))
        for c in n.get('children', []):
            walk(c, depth + 1)

    for r in roots:
        walk(r, 0)

    # 材质
    for i, m in enumerate(js.get('materials', [])[:12]):
        pbr = m.get('pbrMetallicRoughness', {})
        print('  mat[%d] %r base=%s metal=%s rough=%s'
              % (i, m.get('name'), [round(v, 3) for v in pbr.get('baseColorFactor', [])],
                 pbr.get('metallicFactor'), pbr.get('roughnessFactor')))
    if len(js.get('materials', [])) > 12:
        print('  ... 共 %d 个材质' % len(js['materials']))


if __name__ == '__main__':
    for p in sys.argv[1:]:
        report(p)
