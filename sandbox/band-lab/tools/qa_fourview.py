# -*- coding: utf-8 -*-
"""
qa_fourview.py — 四视图产物的量化自检（本会话无法目视看图，只能靠数值核对）

依据 build_fourview.py 写出的 fourview/_layout.json（每个面板精确的
ox/oy/W/H/px 版面几何），逐面板做三项检查：

  1) 尺寸自洽：墨迹包围盒必须与 W×px、H×px 吻合（±3 px），
     投影宽高颠倒 / 深度塌陷 / 空白面板都会立刻暴露；
  2) 贴边：模型已 normalize 到包围盒，四个边必须都有墨迹；
  3) 饱满度：墨迹像素占裁剪区比例，过低说明投影稀疏异常
     （细杆件这类本来就稀疏的会单独标注，不算错误）。

退出码 0 = 全部通过。
"""
import io
import json
import os
import sys

import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
MODELS = os.path.join(ROOT, 'models')
OUT = os.path.join(ROOT, 'fourview')

BG = np.array([18, 20, 26], dtype=np.int32)
PANEL = np.array([26, 29, 37], dtype=np.int32)


def is_ink(pix, tol=10):
    """非背景、非面板底色即视为墨迹（网格线也算，但网格在裁剪区内很细）。"""
    d1 = np.abs(pix - BG[None, None, :]).max(-1)
    d2 = np.abs(pix - PANEL[None, None, :]).max(-1)
    return (d1 > tol) & (d2 > tol)


def main():
    lp = os.path.join(OUT, '_layout.json')
    if not os.path.exists(lp):
        print('缺少 _layout.json，请先运行 build_fourview.py')
        return 1
    with io.open(lp, encoding='utf-8') as f:
        layouts = json.load(f)
    with io.open(os.path.join(MODELS, 'models.json'), encoding='utf-8') as f:
        data = json.load(f)
    ids = [m['id'] for m in data['models']]

    bad = []
    print('%-9s %-11s %-6s %-17s %-13s %s' % ('id', 'panel', 'px/格', '墨迹(实测/期望)', '贴边', '占比'))
    for mid in ids:
        lay = layouts.get(mid)
        if lay is None:
            bad.append('%s: _layout.json 里没有记录' % mid)
            continue
        p = os.path.join(OUT, mid + '_fourview.png')
        im = Image.open(p).convert('RGB')
        a = np.asarray(im).astype(np.int32)
        ss = float(lay['ss'])
        # 版式几何是超采样坐标，除以 ss 得到最终图像坐标
        for g in lay['panels']:
            ox = int(round(g['ox'] / ss))
            oy = int(round(g['oy'] / ss))
            W = int(round(g['W'] * g['px'] / ss))
            H = int(round(g['H'] * g['px'] / ss))
            px = g['px'] / ss
            sub = a[oy:oy + H, ox:ox + W]
            if sub.size == 0:
                bad.append('%s/%s: 裁剪区越界' % (mid, g['view']))
                continue
            ink = is_ink(sub)
            if not ink.any():
                bad.append('%s/%s: 面板全空' % (mid, g['view']))
                continue
            ys, xs = np.where(ink)
            bw, bh = xs.max() - xs.min() + 1, ys.max() - ys.min() + 1
            ew, eh = W, H
            ok_size = abs(bw - ew) <= 3 and abs(bh - eh) <= 3
            edges = (ink[0, :].any(), ink[-1, :].any(), ink[:, 0].any(), ink[:, -1].any())
            ok_edge = all(edges)
            frac = ink.mean()
            tag = []
            if not ok_size:
                tag.append('尺寸不符')
                bad.append('%s/%s: 墨迹 %dx%d，期望 %dx%d' % (mid, g['view'], bw, bh, ew, eh))
            if not ok_edge:
                tag.append('未贴边')
                bad.append('%s/%s: 四边贴边检查失败 %s' % (mid, g['view'], edges))
            if frac < 0.02:
                # 细杆件（麦克风架、琴架）本来就稀疏，只提示不判错
                tag.append('稀疏')
            print('%-9s %-11s %-6.1f %-17s %-13s %.1f%% %s' % (
                mid, g['view'], px, '%dx%d/%dx%d' % (bw, bh, ew, eh),
                'OK' if ok_edge else 'X', frac * 100, ' '.join(tag)))
    print()
    if bad:
        print('问题 %d 条：' % len(bad))
        for b in bad:
            print('  -', b)
        return 1
    print('全部通过：所有投影面板尺寸自洽、四边贴边、无空面板。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
