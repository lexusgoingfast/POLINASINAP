#!/usr/bin/env python3
"""
Подготовка фотографий для архива.

Каждое фото сохраняется в трёх размерах WebP:
  NN-t.webp — миниатюра для лент «Подхода» (320 px по ширине)
  NN-s.webp — превью для сетки (800 px по ширине)
  NN-l.webp — большой кадр для просмотра (2000 px по длинной стороне)

То же самое делает админка (/admin/) прямо в браузере. Добавить новую работу вручную:
  python3 tools/prepare_images.py "путь/к/папке/с/фото" имя-работы

Скрипт положит файлы в img/имя-работы/ и напечатает готовый блок
для вставки в data/works.js.
"""
import os
import sys

from PIL import Image, ImageOps

Image.MAX_IMAGE_PIXELS = None

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXTS = ('.jpg', '.jpeg', '.png', '.tif', '.tiff', '.webp', '.heic')
THUMB_W = 320
SMALL_W = 800
LARGE = 2000


def flatten(im, bg=(236, 235, 231)):
    """Убирает прозрачность: вырезанные предметы кладём на светлый фон."""
    im = ImageOps.exif_transpose(im)
    if im.mode in ('RGBA', 'LA') or (im.mode == 'P' and 'transparency' in im.info):
        im = im.convert('RGBA')
        base = Image.new('RGB', im.size, bg)
        base.paste(im, mask=im.split()[-1])
        return base
    return im.convert('RGB')


def export(im, out_base):
    """Сохраняет out_base-t/-s/-l.webp, возвращает (w, h) большого кадра."""
    im = flatten(im)
    os.makedirs(os.path.dirname(out_base), exist_ok=True)

    large = im.copy()
    large.thumbnail((LARGE, LARGE), Image.LANCZOS)
    large.save(out_base + '-l.webp', 'WEBP', quality=82, method=6)

    small = im.copy()
    if small.width > SMALL_W:
        small = small.resize((SMALL_W, round(small.height * SMALL_W / small.width)), Image.LANCZOS)
    small.save(out_base + '-s.webp', 'WEBP', quality=78, method=6)

    tw = min(THUMB_W, small.width)
    thumb = small.resize((tw, round(small.height * tw / small.width)), Image.LANCZOS)
    thumb.save(out_base + '-t.webp', 'WEBP', quality=72, method=6)
    return large.size


def main():
    if len(sys.argv) != 3:
        print(__doc__)
        sys.exit(1)
    src, slug = sys.argv[1], sys.argv[2]
    files = sorted(f for f in os.listdir(src) if f.lower().endswith(EXTS))
    if not files:
        sys.exit('В папке нет изображений')

    images = []
    for n, name in enumerate(files, 1):
        rel = f'img/{slug}/{n:02d}'
        export(Image.open(os.path.join(src, name)), os.path.join(ROOT, rel))
        images.append(rel)
        print('  ✓', name, '→', rel)

    print('\nВставьте в data/works.js (в начало массива WORKS — новые работы идут первыми):\n')
    print('  {')
    print(f"    id: '{slug}',")
    print("    title: '',")
    print("    category: 'Вещь',")
    print("    project: 'кандиль синап',")
    print("    collection: '',")
    print("    year: '',")
    print("    description: '',")
    print('    details: [],')
    print('    images: [')
    for rel in images:
        print(f"      {{ src: '{rel}' }},")
    print('    ],')
    print("    grid: [{ i: 0 }],")
    print('  },')


if __name__ == '__main__':
    main()
