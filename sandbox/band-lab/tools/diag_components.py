# -*- coding: utf-8 -*-
"""diag_components.py — 打印每件模型的连通块包围盒，定位断开/漂浮的构件。"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from voxel_kit import VOXEL                      # noqa
import gen_models as G                           # noqa


def comps(grid):
    seen, out = set(), []
    for p in grid.v:
        if p in seen:
            continue
        stack, block = [p], []
        seen.add(p)
        while stack:
            q = stack.pop()
            block.append(q)
            for d in ((1, 0, 0), (-1, 0, 0), (0, 1, 0), (0, -1, 0), (0, 0, 1), (0, 0, -1)):
                r = (q[0] + d[0], q[1] + d[1], q[2] + d[2])
                if r in grid.v and r not in seen:
                    seen.add(r)
                    stack.append(r)
        out.append(block)
    out.sort(key=len, reverse=True)
    return out


def main(only=None):
    for mid, fn in G.BUILDERS:
        if only and mid not in only:
            continue
        grid, name, _ = fn()
        grid.prune_enclosed()
        cs = comps(grid)
        print('\n=== %s (%s) components=%d' % (mid, name, len(cs)))
        for idx, block in enumerate(cs):
            xs = [p[0] for p in block]; ys = [p[1] for p in block]; zs = [p[2] for p in block]
            print('  #%d n=%-4d x[%.2f,%.2f] y[%.2f,%.2f] z[%.2f,%.2f] grounded=%s' % (
                idx, len(block),
                min(xs) * VOXEL, (max(xs) + 1) * VOXEL,
                min(ys) * VOXEL, (max(ys) + 1) * VOXEL,
                min(zs) * VOXEL, (max(zs) + 1) * VOXEL,
                any(p[1] == 0 for p in block)))
        fl = grid.floating()
        if fl:
            print('  floating=%d 例: %s' % (len(fl), ['(%.2f,%.2f,%.2f)' % (
                p[0] * VOXEL, p[1] * VOXEL, p[2] * VOXEL) for p in fl[:8]]))


if __name__ == '__main__':
    main(sys.argv[1:] or None)
