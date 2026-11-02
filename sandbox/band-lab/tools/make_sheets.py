# -*- coding: utf-8 -*-
"""把 render/ 与 shots/ 下的图拼成总览图，方便一眼过完所有机位。

用法： python tools/make_sheets.py
输出： preview/render_sheet.png（22 张 Cycles 渲染）
       preview/shots_sheet.png （13 张沙盒截图）
"""
import os
import sys

from PIL import Image, ImageDraw, ImageFont

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
FONT_PATH = r"C:\Windows\Fonts\msyh.ttc"

LABELS = {
    '_band': '全景（Blender Cycles）',
    'drums_p1': '架子鼓 3/4', 'drums_front': '架子鼓 正视', 'drums_side': '架子鼓 侧视',
    'guitar_p1': '电吉他 3/4', 'guitar_front': '电吉他 正视', 'guitar_side': '电吉他 侧视',
    'bass_p1': '电贝斯 3/4', 'bass_front': '电贝斯 正视', 'bass_side': '电贝斯 侧视',
    'keys_p1': '双层键盘 3/4', 'keys_front': '双层键盘 正视', 'keys_side': '双层键盘 侧视',
    'amp_p1': '吉他音箱 3/4', 'amp_front': '吉他音箱 正视', 'amp_side': '吉他音箱 侧视',
    'ampbass_p1': '贝斯音箱 3/4', 'ampbass_front': '贝斯音箱 正视', 'ampbass_side': '贝斯音箱 侧视',
    'front': '正视（观众）', 'front45': '45° 俯视', 'top': '顶视', 'left': '左侧',
    'right': '右侧', 'back': '背视', 'focus_drums': '特写 架子鼓', 'focus_keys': '特写 键盘',
    'focus_amp': '特写 吉他音箱',
    'focus_p_guitar': '乐手 吉他手', 'focus_p_bass': '乐手 贝斯手',
    'focus_p_drums': '乐手 鼓手', 'focus_p_keys': '乐手 键盘手',
    'solid': '素模材质', 'wire': '线框（鼓特写）', 'ui': '带 HUD 面板',
}


def load_order(folder, order):
    out = []
    for name in order:
        p = os.path.join(folder, name + '.png')
        if os.path.exists(p):
            out.append((name, p))
    return out


def sheet(items, cols, cell_w, out_path, title):
    ims = []
    for name, p in items:
        im = Image.open(p).convert('RGB')
        r = cell_w / im.width
        ims.append((name, im.resize((cell_w, int(im.height * r)), Image.LANCZOS)))

    rows = (len(ims) + cols - 1) // cols
    cell_h = max(im.height for _, im in ims)
    pad, head, foot = 10, 56, 30
    W = cols * cell_w + (cols + 1) * pad
    H = head + rows * (cell_h + foot) + pad
    canvas = Image.new('RGB', (W, H), (16, 18, 24))
    d = ImageDraw.Draw(canvas)
    f_title = ImageFont.truetype(FONT_PATH, 26)
    f_cell = ImageFont.truetype(FONT_PATH, 18)
    d.text((pad, 14), title, font=f_title, fill=(235, 240, 250))

    for i, (name, im) in enumerate(ims):
        cx = pad + (i % cols) * (cell_w + pad)
        cy = head + (i // cols) * (cell_h + foot)
        canvas.paste(im, (cx, cy))
        d.text((cx + 2, cy + im.height + 5), LABELS.get(name, name),
               font=f_cell, fill=(170, 182, 200))

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    canvas.save(out_path, optimize=True)
    print('%-40s %d 张  %dx%d  %.2f MB'
          % (out_path, len(ims), canvas.width, canvas.height,
             os.path.getsize(out_path) / 1024 / 1024))


RENDER_ORDER = ['_band',
                'drums_p1', 'drums_front', 'drums_side',
                'guitar_p1', 'guitar_front', 'guitar_side',
                'bass_p1', 'bass_front', 'bass_side',
                'keys_p1', 'keys_front', 'keys_side',
                'amp_p1', 'amp_front', 'amp_side',
                'ampbass_p1', 'ampbass_front', 'ampbass_side']

SHOT_ORDER = ['front', 'front45', 'top', 'left', 'right', 'back',
              'focus_drums', 'focus_keys', 'focus_amp',
              'focus_p_guitar', 'focus_p_bass', 'focus_p_drums', 'focus_p_keys',
              'solid', 'wire', 'ui']


def main():
    sheet(load_order(os.path.join(LAB, 'render'), RENDER_ORDER), 3, 620,
          os.path.join(LAB, 'preview', 'render_sheet.png'),
          'Blender Cycles 渲染总览（6 件乐器 + 全景，每件 3/4、正视、侧视）')
    sheet(load_order(os.path.join(LAB, 'shots'), SHOT_ORDER), 3, 620,
          os.path.join(LAB, 'preview', 'shots_sheet.png'),
          '沙盒页实时截图总览（Three.js + GLB，1600×1000）')
    return 0


if __name__ == '__main__':
    sys.exit(main())
