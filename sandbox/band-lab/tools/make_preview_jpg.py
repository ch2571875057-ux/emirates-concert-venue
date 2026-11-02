# -*- coding: utf-8 -*-
"""把总览图压成轻量 JPG（原 PNG 太大，预览卡有时打不开）。

用法： python tools/make_preview_jpg.py
"""
import os
import sys

from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
OUT = os.path.join(LAB, 'preview')

JOBS = [
    ('render_sheet.png', 'render_sheet.jpg', 1300),
    ('shots_sheet.png', 'shots_sheet.jpg', 1500),
]


def main():
    for src, dst, width in JOBS:
        p = os.path.join(OUT, src)
        if not os.path.exists(p):
            print('跳过（不存在）', p)
            continue
        im = Image.open(p).convert('RGB')
        if im.width > width:
            h = round(im.height * width / im.width)
            im = im.resize((width, h), Image.LANCZOS)
        q = os.path.join(OUT, dst)
        im.save(q, 'JPEG', quality=86, optimize=True, progressive=True)
        print('%-24s %dx%d  %.2f MB'
              % (dst, im.width, im.height, os.path.getsize(q) / 1024 / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
