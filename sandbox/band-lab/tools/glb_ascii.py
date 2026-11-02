# -*- coding: utf-8 -*-
"""把 GLB 用简易 z-buffer + Lambert 着色渲染成 ASCII，用于无图像输入时判读造型。

用法：
    python tools/glb_ascii.py assets/crowd_a.glb                 # 四向视图
    python tools/glb_ascii.py assets/crowd_a.glb --yaw 0 --w 70  # 单视图
选项：
    --yaw 0,90,180,270   绕 Y 轴旋转角（度）。0 = 从 +Z 看向 -Z
    --w 62               字符宽
    --zoom 1.0           缩放系数（>1 放大）
    --center 0.5,0.5     归一化取景中心 (x, y)，范围 0..1
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
CH = ' .:-=+*#%@'


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


def load_tris(path):
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


def render(tris, yaw_deg, W=62, zoom=1.0, cx=0.5, cy=0.5, fov=1.15):
    a = np.radians(yaw_deg)
    ca, sa = np.cos(a), np.sin(a)
    R = np.array([[ca, 0, sa], [0, 1, 0], [-sa, 0, ca]])
    v = tris @ R.T

    lo = v.reshape(-1, 3).min(axis=0)
    hi = v.reshape(-1, 3).max(axis=0)
    ctr = (lo + hi) / 2.0
    span = float(max(hi[0] - lo[0], hi[1] - lo[1]))
    v = v - ctr

    H = max(10, int(round(W * 0.52)))
    # 相机在 +Z 距离 d，透视投影
    d = span / (2 * np.tan(fov / 2)) / zoom
    zc = d - v[:, :, 2]
    zc = np.maximum(zc, 1e-6)
    f = 1.0 / np.tan(fov / 2)
    sx = (v[:, :, 0] / zc) * f
    sy = (v[:, :, 1] / zc) * f

    # 屏幕映射：span/2 对应半个画面
    half = span / 2.0
    px = (sx * d / half * 0.5 + (cx - 0.5)) * (W - 1) + (W - 1) * 0.5
    py = ((cy - 0.5) - sy * d / half * 0.5) * (H - 1) + (H - 1) * 0.5

    zbuf = np.full((H, W), 1e9)
    shade = np.zeros((H, W))

    # 面法线（世界空间，旋转后）与固定光方向
    n = np.cross(v[:, 1] - v[:, 0], v[:, 2] - v[:, 0])
    nl = np.linalg.norm(n, axis=1, keepdims=True)
    n = n / np.maximum(nl, 1e-12)
    L = np.array([-0.42, 0.62, 0.66])
    L = L / np.linalg.norm(L)
    lam = np.clip((n @ L) * 0.5 + 0.5, 0.06, 1.0)
    # 视角相关的边缘提亮
    lam = lam ** 0.85

    for t in range(len(v)):
        X, Y, Z = px[t], py[t], zc[t]
        x0 = max(0, int(np.floor(X.min())))
        x1 = min(W - 1, int(np.ceil(X.max())))
        y0 = max(0, int(np.floor(Y.min())))
        y1 = min(H - 1, int(np.ceil(Y.max())))
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        (ax, ay), (bx, by), (cx2, cy2) = (X[0], Y[0]), (X[1], Y[1]), (X[2], Y[2])
        den = (by - cy2) * (ax - cx2) + (cx2 - bx) * (ay - cy2)
        if abs(den) < 1e-12:
            continue
        w0 = ((by - cy2) * (xs - cx2) + (cx2 - bx) * (ys - cy2)) / den
        w1 = ((cy2 - ay) * (xs - cx2) + (ax - cx2) * (ys - cy2)) / den
        w2 = 1 - w0 - w1
        m = (w0 >= -1e-9) & (w1 >= -1e-9) & (w2 >= -1e-9)
        if not m.any():
            continue
        dep = w0 * Z[0] + w1 * Z[1] + w2 * Z[2]
        yy, xx = ys[m], xs[m]
        dd = dep[m]
        better = dd < zbuf[yy, xx]
        zbuf[yy[better], xx[better]] = dd[better]
        shade[yy[better], xx[better]] = lam[t]

    lines = []
    for j in range(H):
        row = []
        for i in range(W):
            if zbuf[j, i] > 1e8:
                row.append(' ')
            else:
                k = int(round(np.clip(shade[j, i], 0, 1) * 9))
                row.append(CH[k])
        lines.append(''.join(row))
    return lines


def main():
    path = sys.argv[1]
    yaws = [0, 90, 180, 270]
    W = 62
    zoom = 1.0
    cx, cy = 0.5, 0.5
    for i, a in enumerate(sys.argv):
        if a == '--yaw':
            yaws = [int(x) for x in sys.argv[i + 1].split(',')]
        if a == '--w':
            W = int(sys.argv[i + 1])
        if a == '--zoom':
            zoom = float(sys.argv[i + 1])
        if a == '--center':
            cx, cy = [float(x) for x in sys.argv[i + 1].split(',')]

    tris = load_tris(path)
    print('== %s  三角=%d' % (os.path.basename(path), len(tris)))
    for y in yaws:
        lines = render(tris, y, W=W, zoom=zoom, cx=cx, cy=cy)
        print('\n--- yaw=%d（0=从 +Z 看，90=从 +X 看）---' % y)
        for ln in lines:
            print(ln)


if __name__ == '__main__':
    main()
