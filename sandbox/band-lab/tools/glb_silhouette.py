# -*- coding: utf-8 -*-
"""把 GLB 的网格投影成 ASCII 轮廓，用于在没有图像输入能力时判读姿态。

用法： python tools/glb_silhouette.py assets/crowd_a.glb
选项： --views f,s,t   正/侧/顶（f 从 +X 看，s 从 +Z 看，t 从 +Y 看）
      --w 64          字符宽度
"""
import json
import os
import struct
import sys

import numpy as np

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16,
      5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def load_glb(path):
    with open(path, 'rb') as f:
        data = f.read()
    _, _, length = struct.unpack_from('<III', data, 0)
    off, js, binc = 12, None, None
    while off < length:
        clen, ctype = struct.unpack_from('<II', data, off)
        chunk = data[off + 8: off + 8 + clen]
        if ctype == 0x4E4F534A:
            js = json.loads(chunk.decode('utf-8'))
        elif ctype == 0x004E4942:
            binc = chunk
        off += 8 + clen
        off += (4 - off % 4) % 4 if off % 4 else 0
    return js, binc


def read_accessor(js, binc, idx):
    acc = js['accessors'][idx]
    n = acc['count']
    ncomp = NC[acc['type']]
    dt = np.dtype(CT[acc['componentType']])
    bv = js['bufferViews'][acc['bufferView']]
    base = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride') or (ncomp * dt.itemsize)
    if stride == ncomp * dt.itemsize:
        arr = np.frombuffer(binc, dtype=dt, count=n * ncomp, offset=base)
        arr = arr.reshape(n, ncomp)
    else:
        arr = np.empty((n, ncomp), dtype=dt)
        for i in range(n):
            arr[i] = np.frombuffer(binc, dtype=dt, count=ncomp,
                                   offset=base + i * stride)
    return arr.astype(np.float64) if dt.kind == 'f' else arr


def triangles_of(js, binc):
    """返回 (N,3,3) 的三角形顶点数组（仅位置，未变换）。"""
    tris = []
    for mesh in js.get('meshes', []):
        for prim in mesh.get('primitives', []):
            attrs = prim.get('attributes', {})
            if 'POSITION' not in attrs:
                continue
            pos = read_accessor(js, binc, attrs['POSITION'])
            if 'indices' in prim:
                idx = read_accessor(js, binc, prim['indices']).ravel()
            else:
                idx = np.arange(len(pos))
            idx = idx[: len(idx) // 3 * 3].reshape(-1, 3)
            tris.append(pos[idx])
    if not tris:
        return np.zeros((0, 3, 3))
    return np.concatenate(tris, axis=0)


def rasterize(tris2d, W=64, aspect=0.5):
    lo = tris2d.reshape(-1, 2).min(axis=0)
    hi = tris2d.reshape(-1, 2).max(axis=0)
    span = np.maximum(hi - lo, 1e-9)
    H = max(8, int(round(W * span[1] / span[0] * aspect * 2.2)))
    grid = np.zeros((H, W), dtype=np.int32)
    p = (tris2d - lo) / span
    p[:, :, 1] = 1.0 - p[:, :, 1]          # y 翻转（屏幕向下）
    px = p * [W - 1, H - 1]

    for t in px:
        x0, y0 = t.min(axis=0)
        x1, y1 = t.max(axis=0)
        x0, y0 = max(0, int(np.floor(x0))), max(0, int(np.floor(y0)))
        x1, y1 = min(W - 1, int(np.ceil(x1))), min(H - 1, int(np.ceil(y1)))
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        (ax, ay), (bx, by), (cx, cy) = t
        d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(d) < 1e-12:
            continue
        w0 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / d
        w1 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / d
        w2 = 1 - w0 - w1
        m = (w0 >= -1e-9) & (w1 >= -1e-9) & (w2 >= -1e-9)
        grid[ys[m], xs[m]] = 1
    return grid


CH = ' .:-=+*#%@'


def show(grid, title):
    print('--- %s  (%dx%d) ---' % (title, grid.shape[1], grid.shape[0]))
    for row in grid:
        print(''.join(CH[min(9, c * 9)] if c else ' ' for c in row))
    print()


def main():
    path = sys.argv[1]
    views = 'fst'
    for i, a in enumerate(sys.argv):
        if a == '--views' and i + 1 < len(sys.argv):
            views = sys.argv[i + 1]
    W = 64
    for i, a in enumerate(sys.argv):
        if a == '--w' and i + 1 < len(sys.argv):
            W = int(sys.argv[i + 1])

    js, binc = load_glb(path)
    tris = triangles_of(js, binc)
    print('== %s  三角形 %d' % (os.path.basename(path), len(tris)))
    lo = tris.reshape(-1, 3).min(axis=0)
    hi = tris.reshape(-1, 3).max(axis=0)
    print('   bbox min=(%.4f,%.4f,%.4f) max=(%.4f,%.4f,%.4f)  size=(%.4f,%.4f,%.4f)'
          % (*lo, *hi, *(hi - lo)))

    names = {'f': ('正视（沿 -X 看，投影 Z-Y）', (2, 1)),
             's': ('侧视（沿 -Z 看，投影 X-Y）', (0, 1)),
             't': ('顶视（沿 -Y 看，投影 X-Z）', (0, 2))}
    for ch in views:
        title, (ax, ay) = names[ch]
        show(rasterize(tris[:, :, [ax, ay]][:, :, ::1], W=W, aspect=0.5), title)

    # 沿高度的顶点数量分布（判断哪里是头/手/脚）
    y = tris.reshape(-1, 3)[:, 1]
    print('高度分层顶点占比（y 从小到大 12 层）:')
    edges = np.linspace(y.min(), y.max(), 13)
    cnt, _ = np.histogram(y, bins=edges)
    for i in range(12):
        print('  y %.3f..%.3f  %5.1f%%  %s'
              % (edges[i], edges[i + 1], cnt[i] / len(y) * 100,
                 '#' * int(round(cnt[i] / max(cnt) * 40))))


if __name__ == '__main__':
    main()
