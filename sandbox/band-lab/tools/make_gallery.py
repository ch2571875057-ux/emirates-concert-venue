# -*- coding: utf-8 -*-
"""生成 预览图册.html（静态图册，file:// 双击即可看，不需要服务器）。

图片走 preview/web/ 下的轻量 JPG，原尺寸 PNG 只在点击后打开。
用法： python tools/make_gallery.py
"""
import os
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
WEB = 'preview/web'

# (模型 id, 中文名, 尺寸, 体素数, 补充说明)
MODELS = [
    ('drums', '架子鼓', '3.30 × 2.10 × 2.55 m', 1306, '5 鼓 3 镲 + 鼓凳 + 鼓台'),
    ('guitar', '电吉他', '0.60 × 1.88 × 0.45 m', 169, '落地琴架，琴体正面朝观众'),
    ('bass', '电贝斯', '0.60 × 2.17 × 0.45 m', 175, '落地琴架，黑亮漆琴体'),
    ('keys', '双层键盘', '1.50 × 1.65 × 1.12 m', 570, '琴架 + 延音踏板，上层 1.30 m'),
    ('amp', '吉他音箱堆', '1.20 × 1.50 × 0.60 m', 1000, '箱头 + 4×12 单元'),
    ('ampbass', '贝斯一体音箱', '0.98 × 1.12 × 0.60 m', 612, '4×10 一体式'),
]

# 乐手：主项目观众模型上台（assets/crowd_a|crowd_b.glb 复用，scale 1.72）
# (模型 id, 中文名, 尺寸, 补充说明)
PERFORMERS = [
    ('p_guitar', '吉他手', '0.80 × 1.70 × 1.07 m', 'crowd_a.glb · 站在电吉他后'),
    ('p_bass', '贝斯手', '0.80 × 1.71 × 0.90 m', 'crowd_b.glb · 站在电贝斯后'),
    ('p_drums', '鼓手', '0.80 × 1.71 × 0.90 m', 'crowd_b.glb · 坐在鼓组后方'),
    ('p_keys', '键盘手', '0.80 × 1.70 × 1.07 m', 'crowd_a.glb · 站在双层键盘后'),
]

SHOTS = [
    ('front', '正视（观众视角）'), ('front45', '45° 俯视'), ('top', '顶视'),
    ('left', '左侧'), ('right', '右侧'), ('back', '背视'),
    ('focus_drums', '特写 · 架子鼓'), ('focus_keys', '特写 · 双层键盘'),
    ('focus_amp', '特写 · 吉他音箱'),
    ('focus_p_guitar', '特写 · 乐手（吉他手）'), ('focus_p_bass', '特写 · 乐手（贝斯手）'),
    ('focus_p_drums', '特写 · 乐手（鼓手）'), ('focus_p_keys', '特写 · 乐手（键盘手）'),
    ('solid', '素模材质（看整体体块）'), ('wire', '线框 · 鼓特写（看体素密度）'),
    ('ui', '带 HUD 面板'),
]

CSS = """
  :root { --bg:#0e1117; --card:#161b24; --line:#28303d; --text:#e6ecf6;
          --dim:#8b98ad; --accent:#4f8bff; }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
         font:15px/1.7 "Microsoft YaHei","PingFang SC",system-ui,sans-serif; }
  header { padding:34px 40px 18px; border-bottom:1px solid var(--line); }
  h1 { margin:0 0 6px; font-size:25px; font-weight:600; }
  header p { margin:0; color:var(--dim); font-size:14px; }
  nav { position:sticky; top:0; z-index:9; padding:12px 40px;
        background:rgba(14,17,23,.95); border-bottom:1px solid var(--line); }
  nav a { margin-right:20px; color:var(--dim); text-decoration:none; font-size:14px; }
  nav a:hover { color:var(--text); }
  section { padding:32px 40px 8px; }
  h2 { font-size:19px; font-weight:600; margin:0 0 4px; }
  h2 span { color:var(--dim); font-size:13px; font-weight:400; margin-left:10px; }
  .note { color:var(--dim); font-size:13px; margin:0 0 20px; }
  .grid { display:grid; gap:16px; }
  .g3 { grid-template-columns:repeat(auto-fill,minmax(300px,1fr)); }
  .g2 { grid-template-columns:repeat(auto-fill,minmax(460px,1fr)); }
  figure { margin:0; background:var(--card); border:1px solid var(--line);
           border-radius:10px; overflow:hidden; }
  figure a { display:block; }
  img { display:block; width:100%; height:auto; background:#0a0d13; }
  figcaption { padding:9px 13px; font-size:13.5px; }
  figcaption em { display:block; color:var(--dim); font-size:12px;
                  font-style:normal; margin-top:2px; }
  .full { padding:0 40px 24px; }
  .full img { border:1px solid var(--line); border-radius:10px; }
  footer { padding:24px 40px 48px; color:var(--dim); font-size:13px;
           border-top:1px solid var(--line); }
  code { color:#9ec1ff; }
"""


def fig(path, caption, sub=''):
    em = '<em>%s</em>' % sub if sub else ''
    return ('    <figure><a href="%s" target="_blank"><img src="%s" alt="%s" loading="lazy"></a>\n'
            '      <figcaption>%s%s</figcaption></figure>\n'
            % (path, path, caption, caption, em))


def main():
    parts = [
        '<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n<meta charset="utf-8">\n'
        '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
        '<title>乐队乐器模型 — 预览图册</title>\n<style>%s</style>\n</head>\n<body>\n' % CSS,
        '<header>\n  <h1>乐队乐器模型 · 预览图册</h1>\n'
        '  <p>6 件乐器 / 6 种模型 + 4 位乐手 · Minecraft 体素风格 · 体素边长 5 cm · '
        '13 色调色板 · 乐器共 5682 三角面</p>\n</header>\n',
        '<nav>\n  <a href="#overview">总览</a>\n  <a href="#render">Blender 渲染</a>\n'
        '  <a href="#band">乐手</a>\n'
        '  <a href="#shots">沙盒截图</a>\n  <a href="#fourview">四视图</a>\n'
        '  <a href="#howto">怎么看实时场景</a>\n</nav>\n',
        '<section id="overview">\n  <h2>总览 <span>点图可看原尺寸 PNG</span></h2>\n'
        '  <p class="note">上：Blender Cycles 精渲染。下：Three.js 沙盒页实时截图。</p>\n</section>\n',
        '<div class="full"><a href="preview/render_sheet.png" target="_blank">'
        '<img src="%s/sheet_render.jpg" alt="Blender 渲染总览"></a></div>\n' % WEB,
        '<div class="full"><a href="preview/shots_sheet.png" target="_blank">'
        '<img src="%s/sheet_shots.jpg" alt="沙盒截图总览"></a></div>\n' % WEB,
        '<section id="render">\n  <h2>Blender Cycles 渲染 <span>每件 3/4 视角、正视、侧视</span></h2>\n'
        '  <p class="note">高清精渲染，用于判断造型与比例是否准确。</p>\n  <div class="grid g3">\n',
    ]
    for mid, name, size, vox, note in MODELS:
        for suffix, label in [('p1', '3/4 视角'), ('front', '正视'), ('side', '侧视')]:
            parts.append(fig('%s/render__%s_%s.jpg' % (WEB, mid, suffix),
                             '%s · %s' % (name, label),
                             '%s ／ %d 体素%s' % (size, vox,
                                                '，' + note if suffix == 'p1' else '')))
    parts.append('  </div>\n</section>\n')

    parts.append('<section id="band">\n'
                 '  <h2>乐手 <span>复用主项目观众模型，上台当表演者</span></h2>\n'
                 '  <p class="note">assets/crowd_a.glb 与 crowd_b.glb 各用两次：'
                 '吉他手与键盘手用 crowd_a，贝斯手与鼓手用 crowd_b；'
                 'scale 1.72 与主项目 concert.crowd.scale 一致，身高约 1.70 m；'
                 '每人正对自己的乐器、微幅摇摆。麦克风架已按需求移除。</p>\n'
                 '  <div class="grid g2">\n')
    for pid, name, size, note in PERFORMERS:
        parts.append(fig('%s/shots__focus_%s.jpg' % (WEB, pid),
                         '%s · %s' % (name, pid), '%s ／ %s' % (size, note)))
    parts.append('  </div>\n</section>\n')

    parts.append('<section id="shots">\n'
                 '  <h2>沙盒实时截图 <span>Three.js + GLB，1600×1000</span></h2>\n'
                 '  <p class="note">真正要合入主项目的渲染管线，光照与主项目同调。</p>\n'
                 '  <div class="grid g2">\n')
    for name, label in SHOTS:
        parts.append(fig('%s/shots__%s.jpg' % (WEB, name), label))
    parts.append('  </div>\n</section>\n')

    parts.append('<section id="fourview">\n'
                 '  <h2>四视图 <span>正/背/顶/左/右 + 参考原图并排</span></h2>\n'
                 '  <p class="note">建模阶段用来对照参考图的中间产物。</p>\n'
                 '  <div class="grid g2">\n')
    for mid, name, _, _, _ in MODELS:
        parts.append(fig('%s/fourview__%s_fourview.jpg' % (WEB, mid), name))
    parts.append('  </div>\n</section>\n')

    parts.append(
        '<section id="howto">\n  <h2>怎么看实时三维场景</h2>\n  <p class="note">\n'
        '    本图册是静态图片，双击打开即可，<b>不需要服务器</b>。<br>\n'
        '    要在浏览器里转着看三维场景：双击 <code>打开乐队沙盒.bat</code>，'
        '它会自动起本地服务器并打开页面。<br>\n'
        '    注意：直接双击 <code>index.html</code> 会白屏 —— 浏览器禁止从 '
        '<code>file://</code> 加载 ES 模块和 .glb 模型，必须走 http。\n'
        '  </p>\n</section>\n')
    parts.append('<footer>乐队沙盒 · <code>sandbox/band-lab/</code> · '
                 '全部为新增文件，主项目 <code>index.html</code> / '
                 '<code>js/*.js</code> / <code>assets/*</code> 零改动</footer>\n'
                 '</body>\n</html>\n')

    out = os.path.join(LAB, '预览图册.html')
    with open(out, 'w', encoding='utf-8', newline='\n') as f:
        f.write(''.join(parts))
    size = os.path.getsize(out)
    print('写出 %s  %.1f KB' % (out, size / 1024))

    import re
    refs = set(re.findall(r'(?:src|href)="([^"]+)"', ''.join(parts)))
    miss = [r for r in refs if not r.startswith(('#', 'http'))
            and not os.path.exists(os.path.join(LAB, r))]
    print('引用 %d 个本地资源，缺失 %d' % (len(refs) - 5, len(miss)))
    for m in miss:
        print('  缺:', m)
    return 1 if miss else 0


if __name__ == '__main__':
    sys.exit(main())
