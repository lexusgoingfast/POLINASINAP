#!/usr/bin/env python3
"""
Шрифты сайта в WOFF2.

Neue Haas Grotesk Display Pro и Punkbabe распространяются по лицензии,
поэтому в репозитории их нет — соберите файлы из своих:

  python3 tools/prepare_fonts.py "папка/Neue Haas Grotesk Display Pro Cyrillic" "путь/к/PUNKBABE.ttf"

Нужно: pip install fonttools brotli
Результат в assets/fonts/: nhg-display-35/55/65/75.woff2 и punkbabe.woff2
"""
import os
import sys

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'fonts')


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    haas_dir, punk = sys.argv[1], sys.argv[2]
    os.makedirs(OUT, exist_ok=True)

    for name in sorted(os.listdir(haas_dir)):
        if not name.lower().endswith('.otf'):
            continue
        # «Neue Haas Grotesk Display Pro 55 Roman.otf» → 55
        weight = name.split(' Pro ')[1].split(' ')[0]
        font = TTFont(os.path.join(haas_dir, name))
        font.flavor = 'woff2'
        font.save(os.path.join(OUT, f'nhg-display-{weight}.woff2'))
        print('  ✓', name)

    # Punkbabe нужен только для знака: латиница, цифры, пунктуация
    options = subset.Options()
    options.flavor = 'woff2'
    options.layout_features = ['*']
    font = TTFont(punk)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text=''.join(chr(c) for c in range(0x20, 0x7F)))
    subsetter.subset(font)
    font.flavor = 'woff2'
    font.save(os.path.join(OUT, 'punkbabe.woff2'))
    print('  ✓', os.path.basename(punk))


if __name__ == '__main__':
    main()
