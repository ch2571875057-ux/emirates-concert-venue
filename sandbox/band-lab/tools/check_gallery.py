# -*- coding: utf-8 -*-
"""检查 预览图册.html 里引用的本地文件是否都存在。"""
import os
import re
import sys

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HERE = os.path.dirname(os.path.abspath(__file__))
LAB = os.path.dirname(HERE)
SRC = os.path.join(LAB, '预览图册.html')


def main():
    with open(SRC, encoding='utf-8') as f:
        html = f.read()
    refs = set(re.findall(r'(?:src|href)="([^"]+)"', html))
    local = [r for r in refs if not r.startswith(('#', 'http'))]
    miss = [r for r in local if not os.path.exists(os.path.join(LAB, r))]
    print('引用总数 %d，本地 %d，缺失 %d' % (len(refs), len(local), len(miss)))
    for m in miss:
        print('  缺:', m)
    return 1 if miss else 0


if __name__ == '__main__':
    sys.exit(main())
