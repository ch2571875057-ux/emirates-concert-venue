"""把截图转成 ASCII 亮度图 —— 无需人眼看图也能判断图案形状/位置是否正确。

用法:
  python tools/pixel_ascii.py <png> [cols] [extra]
    cols   输出字符列数（默认 96）
    extra  'diff:<png2>' 改为输出两图差异图；'glow' 只显示蓝白发光像素

字符: ' ' 暗 / '.' 微弱 / ':' / '-' / '=' / '+' / '#' 逐级变亮 / '@' 过曝
发光判定: b >= 90 且 b > r*1.05 且亮度 > 40（应援棒为蓝白 HDR）
"""
import sys
from PIL import Image

RAMP = ' .:-=+#@'


def load(path):
    return Image.open(path).convert('RGB')


def ascii_map(im, cols=96, mode='lum'):
    w, h = im.size
    rows = max(1, int(cols * h / w * 0.5))  # 字符宽高比 ≈2:1
    small = im.resize((cols, rows), Image.BOX)
    px = small.load()
    out = []
    for y in range(rows):
        line = []
        for x in range(cols):
            r, g, b = px[x, y]
            lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
            if mode == 'glow':
                is_glow = b >= 90 and b > r * 1.05 and lum > 40
                line.append('#' if is_glow else ' ')
            else:
                idx = min(len(RAMP) - 1, int(lum / 256 * len(RAMP)))
                line.append(RAMP[idx])
        out.append(''.join(line))
    return out


def crop_frac(im, x0, y0, x1, y1):
    w, h = im.size
    return im.crop((int(w * x0), int(h * y0), int(w * x1), int(h * y1)))


def diff_map(a, b, cols=96):
    if a.size != b.size:
        b = b.resize(a.size)
    w, h = a.size
    rows = max(1, int(cols * h / w * 0.5))
    sa = a.resize((cols, rows), Image.BOX).load()
    sb = b.resize((cols, rows), Image.BOX).load()
    out = []
    for y in range(rows):
        line = []
        for x in range(cols):
            d = sum(abs(sa[x, y][i] - sb[x, y][i]) for i in range(3)) / 3
            idx = min(len(RAMP) - 1, int(d / 256 * len(RAMP) * 2.2))
            line.append(RAMP[idx])
        out.append(''.join(line))
    return out


if __name__ == '__main__':
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(2)
    path = sys.argv[1]
    cols = int(sys.argv[2]) if len(sys.argv) > 2 else 96
    extra = sys.argv[3] if len(sys.argv) > 3 else ''
    im = load(path)
    # crop:0.0,0.1,1.0,0.5  —— 按比例裁切后再出图
    if extra.startswith('crop:'):
        x0, y0, x1, y1 = (float(v) for v in extra[5:].split(','))
        im = crop_frac(im, x0, y0, x1, y1)
        mode, extra = 'lum', 'crop'
        lines = ascii_map(im, cols, mode)
        print(f'{path}  [crop {x0},{y0},{x1},{y1}]  {im.size[0]}x{im.size[1]}')
    elif extra.startswith('cropglow:'):
        x0, y0, x1, y1 = (float(v) for v in extra[9:].split(','))
        im = crop_frac(im, x0, y0, x1, y1)
        lines = ascii_map(im, cols, 'glow')
        print(f'{path}  [cropglow {x0},{y0},{x1},{y1}]  {im.size[0]}x{im.size[1]}')
    elif extra.startswith('diff:'):
        im2 = load(extra[5:])
        lines = diff_map(im, im2, cols)
        print(f'DIFF {path} vs {extra[5:]}')
    else:
        lines = ascii_map(im, cols, 'glow' if extra == 'glow' else 'lum')
        print(f'{path}  [{extra or "lum"}]  {im.size[0]}x{im.size[1]}')
    for ln in lines:
        print(ln)
