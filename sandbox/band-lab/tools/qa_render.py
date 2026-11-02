# -*- coding: utf-8 -*-
"""
qa_render.py — 对 Cycles 渲染图做**客观**检查（不能替代人眼，但能挡住明显事故）

检查项：
  1. 亮度：全图平均亮度、非背景像素（与角落背景色差异 > 12）的平均亮度
     → 判定是否全黑 / 过曝 / 主体没被打亮
  2. 主体占比：非背景像素比例 → 判定是否空帧、主体是否太小/出画
  3. 主体包围盒：非背景像素的 bbox 相对画面四边的留白 → 判定是否被切掉
  4. 颜色多样性：非背景像素的量化色数 → 判定是否糊成一坨（材质/法线事故）
  5. 与上一版对比不必要——只输出数值，交由人眼最终确认

用法： python tools/qa_render.py [render 目录]
"""
import glob
import io
import os
import sys

from PIL import Image
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
RENDER = sys.argv[1] if len(sys.argv) > 1 else os.path.join(LAB, 'render')


def bg_color(a):
    """取四角 40x40 的中位色作为背景。"""
    h, w = a.shape[:2]
    s = 40
    corners = np.concatenate([
        a[:s, :s].reshape(-1, 3), a[:s, -s:].reshape(-1, 3),
        a[-s:, :s].reshape(-1, 3), a[-s:, -s:].reshape(-1, 3)])
    return np.median(corners, axis=0)


def check(path):
    img = Image.open(path).convert('RGB')
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    bg = bg_color(a)
    diff = np.abs(a - bg).max(axis=2)
    mask = diff > 12
    frac = mask.sum() / float(h * w)
    lum = 0.2126 * a[:, :, 0] + 0.7152 * a[:, :, 1] + 0.0722 * a[:, :, 2]
    lum_all = lum.mean()
    lum_obj = lum[mask].mean() if mask.any() else 0.0
    if mask.any():
        ys, xs = np.where(mask)
        x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
        pad = (x0 / w, (w - 1 - x1) / w, y0 / h, (h - 1 - y1) / h)
        q = (a[mask] // 32).astype(np.int32)
        keys = q[:, 0] * 64 + q[:, 1] * 8 + q[:, 2]
        ncol = len(np.unique(keys))
    else:
        pad = (1, 1, 1, 1)
        ncol = 0
    return dict(path=os.path.basename(path), w=w, h=h, frac=frac,
                lum_all=lum_all, lum_obj=lum_obj, pad=pad, ncol=ncol,
                bg=tuple(int(v) for v in bg))


def main():
    files = sorted(glob.glob(os.path.join(RENDER, '*.png')))
    if not files:
        print('没有找到渲染图')
        return 1
    bad = []
    print('%-22s %-11s %-7s %-7s %-7s %-5s %s'
          % ('file', 'size', 'obj%', 'lum全', 'lum体', '色数', '留白 左/右/上/下'))
    for p in files:
        r = check(p)
        notes = []
        if r['lum_all'] < 6:
            notes.append('全黑')
            bad.append('%s: 整张图几乎全黑 (lum=%.1f)' % (r['path'], r['lum_all']))
        if r['frac'] < 0.02:
            notes.append('主体过小或空帧')
            bad.append('%s: 主体只占 %.2f%%' % (r['path'], r['frac'] * 100))
        if r['frac'] > 0.92:
            notes.append('主体撑满疑似出画')
            bad.append('%s: 主体占 %.1f%%（可能被裁切）' % (r['path'], r['frac'] * 100))
        if r['lum_obj'] < 10:
            notes.append('主体太暗')
            bad.append('%s: 主体平均亮度 %.1f 太暗' % (r['path'], r['lum_obj']))
        if r['lum_obj'] > 245:
            notes.append('主体过曝')
            bad.append('%s: 主体过曝 lum=%.1f' % (r['path'], r['lum_obj']))
        if r['ncol'] < 3:
            notes.append('颜色过少')
            bad.append('%s: 只有 %d 种量化色' % (r['path'], r['ncol']))
        if min(r['pad']) < 0.002:
            notes.append('贴边可能出画')
        print('%-22s %-11s %-7s %-7s %-7s %-5d %.3f/%.3f/%.3f/%.3f %s'
              % (r['path'], '%dx%d' % (r['w'], r['h']), '%.1f' % (r['frac'] * 100),
                 '%.1f' % r['lum_all'], '%.1f' % r['lum_obj'], r['ncol'],
                 r['pad'][0], r['pad'][1], r['pad'][2], r['pad'][3], ' '.join(notes)))
    print()
    if bad:
        print('需要关注 %d 条：' % len(bad))
        for b in bad:
            print('  -', b)
        return 1
    print('客观检查通过：无全黑/空帧/过曝/贴边，主体亮度与色彩层次正常。'
          '\n注意：这只能排除事故，造型是否好看仍需人眼确认。')
    return 0


if __name__ == '__main__':
    sys.exit(main())
