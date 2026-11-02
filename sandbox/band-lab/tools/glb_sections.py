# -*- coding: utf-8 -*-
"""按高度分层，报告 XZ 截面的连通团块（判断人体姿态：手臂/腿/持物）。

用法： python tools/glb_sections.py assets/crowd_a.glb
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
        if off % 4:
            off += 4 - off % 4
    return js, binc


def read_accessor(js, binc, idx):
    acc = js['accessors'][idx]
    ncomp = NC[acc['type']]
    dt = np.dtype(CT[acc['componentType']])
    bv = js['bufferViews'][acc['bufferView']]
    base = bv.get('byteOffset', 0) + acc.get('byteOffset', 0)
    stride = bv.get('byteStride') or (ncomp * dt.itemsize)
    if stride == ncomp * dt.itemsize:
        arr = np.frombuffer(binc, dtype=dt, count=acc['count'] * ncomp, offset=base)
        return arr.reshape(acc['count'], ncomp).astype(np.float64)
    out = np.empty((acc['count'], ncomp))
    for i in range(acc['count']):
        out[i] = np.frombuffer(binc, dtype=dt, count=ncomp, offset=base + i * stride)
    return out


def tris(path):
    js, binc = load_glb(path)
    out = []
    for m in js.get('meshes', []):
        for p in m.get('primitives', []):
            pos = read_accessor(js, binc, p['attributes']['POSITION'])
            if 'indices' in p:
                idx = read_accessor(js, binc, p['indices']).ravel().astype(int)
            else:
                idx = np.arange(len(pos))
            out.append(pos[idx[: len(idx) // 3 * 3].reshape(-1, 3)])
    return np.concatenate(out)


def sample_surface(t, step=0.006):
    """在三角面上均匀撒点，近似实心表面采样。"""
    pts = []
    a, b, c = t[:, 0], t[:, 1], t[:, 2]
    area = 0.5 * np.linalg.norm(np.cross(b - a, c - a), axis=1)
    total = area.sum()
    n = max(4000, int(total / (step * step)))
    idx = np.repeat(np.arange(len(t)), np.maximum(1, (area / total * n).astype(int)))
    r1 = np.sqrt(np.random.rand(len(idx)))
    r2 = np.random.rand(len(idx))
    p = (a[idx] * (1 - r1)[:, None]
         + b[idx] * (r1 * (1 - r2))[:, None]
         + c[idx] * (r1 * r2)[:, None])
    return p


def clusters(mask, nx, nz, xr, zr):
    """mask: (nx, nz) 布尔。返回 [(xc, zc, xw, zw, n)]。"""
    seen = np.zeros_like(mask, dtype=bool)
    out = []
    for i in range(nx):
        for j in range(nz):
            if not mask[i, j] or seen[i, j]:
                continue
            stack = [(i, j)]
            seen[i, j] = True
            cells = []
            while stack:
                ci, cj = stack.pop()
                cells.append((ci, cj))
                for di, dj in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    a, b = ci + di, cj + dj
                    if 0 <= a < nx and 0 <= b < nz and mask[a, b] and not seen[a, b]:
                        seen[a, b] = True
                        stack.append((a, b))
            arr = np.array(cells)
            xi, zj = arr[:, 0], arr[:, 1]
            out.append((xr[0] + (xi.mean() + 0.5) * (xr[1] - xr[0]) / nx,
                        zr[0] + (zj.mean() + 0.5) * (zr[1] - zr[0]) / nz,
                        (xi.max() - xi.min() + 1) * (xr[1] - xr[0]) / nx,
                        (zj.max() - zj.min() + 1) * (zr[1] - zr[0]) / nz,
                        len(cells)))
    out.sort(key=lambda r: -r[4])
    return out


def main():
    np.random.seed(7)
    path = sys.argv[1]
    t = tris(path)
    pts = sample_surface(t)
    lo = t.reshape(-1, 3).min(axis=0)
    hi = t.reshape(-1, 3).max(axis=0)
    print('== %s  三角=%d  采样点=%d' % (os.path.basename(path), len(t), len(pts)))
    print('   bbox  x %.3f..%.3f  y %.3f..%.3f  z %.3f..%.3f'
          % (lo[0], hi[0], lo[1], hi[1], lo[2], hi[2]))

    NB = 18
    edges = np.linspace(lo[1], hi[1], NB + 1)
    xr = (lo[0], hi[0])
    zr = (lo[2], hi[2])
    NX, NZ = 26, 26
    print('\n  高度带（自上而下） | 团块数 | 各团块中心(x,z) 尺寸(x×z) 占比')
    for k in range(NB - 1, -1, -1):
        y0, y1 = edges[k], edges[k + 1]
        sub = pts[(pts[:, 1] >= y0) & (pts[:, 1] < y1 + 1e-9)]
        if len(sub) < 12:
            print('  y %+.3f..%+.3f |  0 | -' % (y0, y1))
            continue
        mask = np.zeros((NX, NZ), dtype=bool)
        ix = np.clip(((sub[:, 0] - xr[0]) / (xr[1] - xr[0]) * NX).astype(int), 0, NX - 1)
        iz = np.clip(((sub[:, 2] - zr[0]) / (zr[1] - zr[0]) * NZ).astype(int), 0, NZ - 1)
        mask[ix, iz] = True
        cl = clusters(mask, NX, NZ, xr, zr)
        tot = sum(c[4] for c in cl) or 1
        desc = ' ; '.join('(x%+.3f,z%+.3f) %.2fx%.2f %.0f%%'
                          % (c[0], c[1], c[2], c[3], c[4] / tot * 100)
                          for c in cl[:4])
        print('  y %+.3f..%+.3f |  %d  | %s' % (y0, y1, len(cl), desc))


if __name__ == '__main__':
    main()
