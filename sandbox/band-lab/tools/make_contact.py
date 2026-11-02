# -*- coding: utf-8 -*-
"""生成一张「总览」JPG —— 双击用系统图片查看器就能看，完全不依赖浏览器。

这是最保底的入口：Windows 照片查看器默认能开 JPG，与 .html 关联无关。
用法： python tools/make_contact.py
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
OUT = os.path.join(LAB, '总览.jpg')

FONT_CANDIDATES = [
    r'C:\Windows\Fonts\msyh.ttc',
    r'C:\Windows\Fonts\msyhbd.ttc',
    r'C:\Windows\Fonts\simhei.ttf',
]

# (相对路径, 中文标题, 副标题)
ITEMS = [
    (r'render/drums_p1.png', '架子鼓', '3.30 x 2.10 x 2.55 m'),
    (r'render/guitar_p1.png', '电吉他', '0.60 x 1.88 x 0.45 m'),
    (r'render/bass_p1.png', '电贝斯', '0.60 x 2.17 x 0.45 m'),
    (r'render/keys_p1.png', '双层键盘', '1.50 x 1.65 x 1.12 m'),
    (r'render/amp_p1.png', '吉他音箱堆', '1.20 x 1.50 x 0.60 m'),
    (r'render/ampbass_p1.png', '贝斯一体音箱', '0.98 x 1.12 x 0.60 m'),
    (r'shots/front45.png', '沙盒页 · 45 度俯视', 'Three.js + GLB 实时渲染'),
    (r'shots/front.png', '沙盒页 · 观众正视', ''),
    (r'shots/top.png', '沙盒页 · 顶视摆位', ''),
    (r'shots/focus_drums.png', '特写 · 架子鼓', ''),
    (r'shots/focus_keys.png', '特写 · 双层键盘', ''),
    (r'shots/focus_amp.png', '特写 · 吉他音箱', ''),
    (r'shots/focus_p_guitar.png', '乐手 · 吉他手', 'crowd_a.glb · 1.70 m'),
    (r'shots/focus_p_bass.png', '乐手 · 贝斯手', 'crowd_b.glb · 1.71 m'),
    (r'shots/focus_p_drums.png', '乐手 · 鼓手', 'crowd_b.glb · 1.71 m'),
    (r'shots/focus_p_keys.png', '乐手 · 键盘手', 'crowd_a.glb · 1.70 m'),
]


def load_font(size):
    for p in FONT_CANDIDATES:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except Exception:
                pass
    return ImageFont.load_default()


def main():
    missing = [p for p, _, _ in ITEMS if not os.path.exists(os.path.join(LAB, p))]
    if missing:
        print('缺少源图：', missing)
        return 1

    COLS, CELL_W, CELL_H = 3, 760, 620
    PAD, TITLE_H, FOOT_H, HEAD_H = 22, 300, 34, 130

    rows = (len(ITEMS) + COLS - 1) // COLS
    W = PAD + COLS * (CELL_W + PAD)
    H = HEAD_H + rows * (CELL_H + TITLE_H + FOOT_H + PAD) + PAD

    sheet = Image.new('RGB', (W, H), (16, 19, 26))
    d = ImageDraw.Draw(sheet)
    f_head = load_font(40)
    f_title = load_font(26)
    f_sub = load_font(20)

    d.text((PAD + 4, 30), '乐队乐器模型 · 总览', font=f_head, fill=(232, 240, 250))
    d.text((PAD + 4, 84), '6 件乐器 / 6 种模型 + 4 位乐手 · Minecraft 体素风格 · '
                          '体素边长 5 cm · 13 色 · 5682 三角面',
           font=f_sub, fill=(139, 152, 173))

    for i, (rel, title, sub) in enumerate(ITEMS):
        r, c = divmod(i, COLS)
        x = PAD + c * (CELL_W + PAD)
        y = HEAD_H + r * (CELL_H + TITLE_H + FOOT_H + PAD)

        im = Image.open(os.path.join(LAB, rel)).convert('RGB')
        scale = min(CELL_W / im.width, CELL_H / im.height)
        nw, nh = max(1, round(im.width * scale)), max(1, round(im.height * scale))
        im = im.resize((nw, nh), Image.LANCZOS)
        ox = x + (CELL_W - nw) // 2
        oy = y + (CELL_H - nh) // 2
        d.rectangle([x, y, x + CELL_W, y + CELL_H], fill=(10, 13, 19),
                    outline=(40, 48, 61))
        sheet.paste(im, (ox, oy))

        d.text((x + 4, y + CELL_H + 14), title, font=f_title, fill=(230, 238, 248))
        if sub:
            d.text((x + 4, y + CELL_H + 50), sub, font=f_sub, fill=(126, 143, 166))

    sheet.save(OUT, 'JPEG', quality=88, optimize=True, progressive=True)
    kb = os.path.getsize(OUT) / 1024
    print('写出 %s  %dx%d  %.0f KB' % (OUT, W, H, kb))
    return 0


if __name__ == '__main__':
    sys.exit(main())
