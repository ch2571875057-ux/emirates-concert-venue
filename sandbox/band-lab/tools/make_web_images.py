# -*- coding: utf-8 -*-
"""为预览图册生成 Web 优化版本（JPG/PNG 缩到合适宽度），避免本地打开时卡死。

原图（PNG，单张 1 MB 上下、总 32 MB）保留不动，只往 preview/web/ 写轻量副本。
用法： python tools/make_web_images.py
"""
import os
import sys

from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
OUT = os.path.join(LAB, 'preview', 'web')

# (源目录, 最大宽度, 输出质量)
JOBS = [
    ('render', 900, 82),
    ('shots', 1100, 84),
    ('fourview', 1000, 82),
]


def main():
    os.makedirs(OUT, exist_ok=True)
    total_in = total_out = 0
    n = 0
    for folder, width, quality in JOBS:
        src_dir = os.path.join(LAB, folder)
        if not os.path.isdir(src_dir):
            continue
        for name in sorted(os.listdir(src_dir)):
            if not name.lower().endswith('.png'):
                continue
            p = os.path.join(src_dir, name)
            im = Image.open(p).convert('RGB')
            if im.width > width:
                im = im.resize((width, round(im.height * width / im.width)),
                               Image.LANCZOS)
            q = os.path.join(OUT, folder + '__' + name[:-4] + '.jpg')
            im.save(q, 'JPEG', quality=quality, optimize=True, progressive=True)
            total_in += os.path.getsize(p)
            total_out += os.path.getsize(q)
            n += 1
    # 总览图也做一份
    for src, dst, width in [('render_sheet.png', 'sheet_render.jpg', 1200),
                            ('shots_sheet.png', 'sheet_shots.jpg', 1400)]:
        p = os.path.join(LAB, 'preview', src)
        if not os.path.exists(p):
            continue
        im = Image.open(p).convert('RGB')
        if im.width > width:
            im = im.resize((width, round(im.height * width / im.width)), Image.LANCZOS)
        q = os.path.join(OUT, dst)
        im.save(q, 'JPEG', quality=84, optimize=True, progressive=True)
        total_in += os.path.getsize(p)
        total_out += os.path.getsize(q)
    print('%d 张，%.1f MB -> %.1f MB' % (n, total_in / 1024 / 1024,
                                       total_out / 1024 / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
