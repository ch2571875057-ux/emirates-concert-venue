# -*- coding: utf-8 -*-
"""为 band-lab 生成完全自包含的「单文件」图册：图片全部内联成 base64。

用途：用户环境下 .html 被关联到 IE，且相对路径/中文文件名容易踩坑，
这里产出一个零依赖、零子资源的 HTML —— 双击（用 Edge/Chrome 打开）即可看全部图。
体积约 7-9 MB，可接受。

用法： python tools/make_single_html.py
"""
import base64
import io
import os
import sys

from PIL import Image

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
OUT = os.path.join(LAB, 'gallery-bundled.html')

MODELS = [
    ('drums', '架子鼓', '3.30 x 2.10 x 2.55 m', 1306, '5 鼓 3 镲 + 鼓凳'),
    ('guitar', '电吉他', '0.60 x 1.88 x 0.45 m', 169, '落地琴架'),
    ('bass', '电贝斯', '0.60 x 2.17 x 0.45 m', 175, '落地琴架，黑亮漆'),
    ('keys', '双层键盘', '1.50 x 1.65 x 1.12 m', 570, '琴架 + 延音踏板'),
    ('amp', '吉他音箱堆', '1.20 x 1.50 x 0.60 m', 1000, '箱头 + 4x12'),
    ('ampbass', '贝斯一体音箱', '0.98 x 1.12 x 0.60 m', 612, '4x10 一体式'),
]

# 乐手：主项目观众模型上台（assets/crowd_a|crowd_b.glb 各复用两次）
PERFORMERS = [
    ('p_guitar', '吉他手', '0.80 x 1.70 x 1.07 m', 'crowd_a.glb，站在电吉他后'),
    ('p_bass', '贝斯手', '0.80 x 1.71 x 0.90 m', 'crowd_b.glb，站在电贝斯后'),
    ('p_drums', '鼓手', '0.80 x 1.71 x 0.90 m', 'crowd_b.glb，坐在鼓组后方'),
    ('p_keys', '键盘手', '0.80 x 1.70 x 1.07 m', 'crowd_a.glb，站在双层键盘后'),
]

SHOTS = [
    ('front', '观众正视'), ('front45', '45 度俯视'), ('top', '顶视摆位'),
    ('left', '左侧'), ('right', '右侧'), ('back', '背视'),
    ('focus_drums', '特写 · 架子鼓'), ('focus_keys', '特写 · 双层键盘'),
    ('focus_amp', '特写 · 吉他音箱'),
    ('solid', '素模（看体块）'), ('wire', '线框（看体素密度）'),
]


def data_uri(path, max_w, quality):
    im = Image.open(path).convert('RGB')
    if im.width > max_w:
        im = im.resize((max_w, round(im.height * max_w / im.width)), Image.LANCZOS)
    buf = io.BytesIO()
    im.save(buf, 'JPEG', quality=quality, optimize=True, progressive=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    return 'data:image/jpeg;base64,' + b64, len(buf.getvalue())


def main():
    cards = []
    total = 0

    def add(src, caption, sub, max_w, q):
        nonlocal total
        p = os.path.join(LAB, src)
        if not os.path.exists(p):
            print('  跳过缺失:', src)
            return
        uri, n = data_uri(p, max_w, q)
        total += n
        em = '<em>%s</em>' % sub if sub else ''
        cards.append(
            '<figure><img src="%s" alt="%s"><figcaption>%s%s</figcaption></figure>'
            % (uri, caption, caption, em))

    for mid, name, size, vox, note in MODELS:
        for suf in ('p1', 'front', 'side'):
            lbl = {'p1': '3/4 视角', 'front': '正视', 'side': '侧视'}[suf]
            add('render/%s_%s.png' % (mid, suf), '%s · %s' % (name, lbl),
                '%s / %d 体素%s' % (size, vox, '，' + note if suf == 'p1' else ''),
                720, 82)
    for name, label in SHOTS:
        add('shots/%s.png' % name, '沙盒 · ' + label, '', 900, 84)
    for pid, name, size, note in PERFORMERS:
        add('shots/focus_%s.png' % pid, '乐手 · ' + name,
            '%s / %s' % (size, note), 760, 84)
    for mid, name, _, _, _ in MODELS:
        add('fourview/%s_fourview.png' % mid, '四视图 · ' + name, '正/背/顶/左/右 + 参考图',
            760, 80)

    css = (
        "body{margin:0;background:#0e1117;color:#e6ecf6;"
        "font:15px/1.65 'Microsoft YaHei',system-ui,sans-serif}"
        "header{padding:30px 36px 16px;border-bottom:1px solid #28303d}"
        "h1{margin:0 0 6px;font-size:24px}"
        "header p{margin:0;color:#8b98ad;font-size:13.5px}"
        "main{padding:24px 36px 40px;display:grid;gap:16px;"
        "grid-template-columns:repeat(auto-fill,minmax(330px,1fr))}"
        "figure{margin:0;background:#161b24;border:1px solid #28303d;"
        "border-radius:10px;overflow:hidden}"
        "img{display:block;width:100%;height:auto;background:#0a0d13}"
        "figcaption{padding:9px 13px;font-size:13.5px}"
        "figcaption em{display:block;color:#8b98ad;font-size:12px;"
        "font-style:normal;margin-top:2px}"
        "footer{padding:0 36px 44px;color:#8b98ad;font-size:13px}"
    )

    html = (
        '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width,initial-scale=1">\n'
        '<title>乐队乐器模型 · 图册（单文件）</title>\n<style>%s</style>\n</head>\n<body>\n'
        '<header><h1>乐队乐器模型 · 图册</h1>\n'
        '<p>6 件乐器 / 6 种模型 + 4 位乐手 · Minecraft 体素风格 · 体素边长 5 cm · '
        '13 色 · 乐器共 5682 三角面 · 图片已全部内联，无外部依赖</p></header>\n'
        '<main>\n%s\n</main>\n'
        '<footer>sandbox/band-lab · 全部为新增文件，主项目零改动</footer>\n'
        '</body>\n</html>\n' % (css, '\n'.join(cards))
    )

    with open(OUT, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)
    print('写出 %s  图片 %d 张  %.1f MB（编码后 %.1f MB）'
          % (OUT, len(cards), total / 1024 / 1024,
             os.path.getsize(OUT) / 1024 / 1024))
    return 0


if __name__ == '__main__':
    sys.exit(main())
