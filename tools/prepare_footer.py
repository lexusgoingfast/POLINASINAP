#!/usr/bin/env python3
"""
Ролики для подвала (TouchDesigner) → сайт.

  python3 tools/prepare_footer.py "папка/с/роликами"      все .mp4 из папки, по порядку имён
  python3 tools/prepare_footer.py a.mp4 b.mp4 c.mp4       или список файлов
  ... --watch                                              пересобирать после каждого экспорта

Каждый ролик становится циклом «белое на чёрном» (инверт-версии не нужны: инверт на сайте делает CSS).
В assets/footer/ ложатся loop-01.mp4 и loop-01.webp (постер), loop-02… — при каждом открытии сайт
показывает случайный. Число роликов указано в data/works.js (footerLoops), скрипт напомнит, если оно
не совпадает.

Нужны ffmpeg (brew install ffmpeg) и Pillow. --crf: чем больше, тем легче файл; плотный полутон сжимается
хуже логотипа, поэтому по умолчанию 34.
"""
import argparse
import glob
import os
import re
import sys
import time

import loops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'footer')


def sources(paths):
    files = []
    for path in paths:
        if os.path.isdir(path):
            files += sorted(glob.glob(os.path.join(path, '*.mp4')))
        elif os.path.isfile(path):
            files.append(path)
        else:
            sys.exit(f'Не найдено: {path}')
    if not files:
        sys.exit('Нет роликов .mp4')
    return files


def name(index):
    return f'loop-{index + 1:02d}'


def build(src, index, crf):
    video = os.path.join(OUT, name(index) + '.mp4')
    loops.encode(src, video, crf)
    width, height = loops.poster(video, os.path.join(OUT, name(index) + '.webp'))
    kb = os.path.getsize(video) / 1024
    print(f'  ✓ {time.strftime("%H:%M:%S")}  {name(index)}  ← {os.path.basename(src)}  {kb:,.0f} КБ, {width}×{height}', flush=True)


def finish(count):
    for f in glob.glob(os.path.join(OUT, 'loop-*')):  # лишние файлы от прошлых, более длинных наборов
        m = re.match(r'loop-(\d+)\.', os.path.basename(f))
        if m and int(m.group(1)) > count:
            os.remove(f)
    try:
        data = open(os.path.join(ROOT, 'data', 'works.js'), encoding='utf-8').read()
    except OSError:
        return
    m = re.search(r'footerLoops:\s*(\d+)', data)
    if not m or int(m.group(1)) != count:
        print(f'  ! В data/works.js укажите footerLoops: {count}', flush=True)


def signatures(files):
    sig = {}
    for f in files:
        try:
            st = os.stat(f)
            sig[f] = (st.st_mtime, st.st_size)
        except FileNotFoundError:
            pass
    return sig


def watch(paths, crf):
    print('Слежу за роликами (Ctrl+C — остановить)', flush=True)
    files_before, done = None, {}
    while True:
        try:
            files = sources(paths)
        except SystemExit:
            files = []
        sig = signatures(files)
        changed = [f for f in files if f in sig and done.get(f) != sig[f]]
        if changed or files != files_before:
            time.sleep(1.5)  # даём TouchDesigner дописать файлы
            if signatures(files) == sig:
                for f in (files if files != files_before else changed):
                    build(f, files.index(f), crf)
                finish(len(files))
                files_before, done = files, sig
        time.sleep(1)


def main():
    p = argparse.ArgumentParser(description='Ролики для подвала из TouchDesigner → сайт')
    p.add_argument('sources', nargs='+', help='папка с .mp4 или список файлов')
    p.add_argument('--watch', action='store_true', help='пересобирать при каждом новом экспорте')
    p.add_argument('--crf', type=int, default=34, help='качество H.264: 30 — лучше, 38 — легче (по умолчанию 34)')
    a = p.parse_args()
    try:
        if a.watch:
            watch(a.sources, a.crf)
        else:
            files = sources(a.sources)
            for i, f in enumerate(files):
                build(f, i, a.crf)
            finish(len(files))
    except KeyboardInterrupt:
        print()


if __name__ == '__main__':
    main()
