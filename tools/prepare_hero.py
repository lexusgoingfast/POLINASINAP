#!/usr/bin/env python3
"""
Анимация знака NASEKOLINA (TouchDesigner) → сайт.

  python3 tools/prepare_hero.py "путь/к/hero-loop.mp4"            один раз
  python3 tools/prepare_hero.py "путь/к/hero-loop.mp4" --watch    пересобирать после каждого экспорта

На вход — ролик «белое на чёрном» (hero-loop-invert.mp4 не нужен: инверт на сайте делает CSS).
Скрипт кладёт в assets/hero/:
  hero-loop.mp4     H.264 без звука; каждый кадр заранее пропущен через жёсткий порог (строго два цвета)
  hero-poster.webp  первый кадр: виден до загрузки ролика и при «уменьшении движения» в системе

Нужны ffmpeg (brew install ffmpeg) и Pillow. --crf: чем больше, тем легче файл (по умолчанию 30).
"""
import argparse
import os
import sys
import time

import loops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'assets', 'hero')


def build(src, crf):
    video = os.path.join(OUT, 'hero-loop.mp4')
    loops.encode(src, video, crf)
    width, height = loops.poster(video, os.path.join(OUT, 'hero-poster.webp'))
    kb = os.path.getsize(video) / 1024
    print(f'  ✓ {time.strftime("%H:%M:%S")}  hero-loop.mp4 {kb:,.0f} КБ, кадр {width}×{height}', flush=True)


def watch(src, crf):
    print(f'Слежу за {src} (Ctrl+C — остановить)', flush=True)
    done = None
    while True:
        try:
            st = os.stat(src)
            sig = (st.st_mtime, st.st_size)
        except FileNotFoundError:
            sig = None
        if sig and sig != done:
            time.sleep(1.5)  # даём TouchDesigner дописать файл
            st = os.stat(src)
            if (st.st_mtime, st.st_size) == sig:
                build(src, crf)
                done = sig
        time.sleep(1)


def main():
    p = argparse.ArgumentParser(description='Анимация знака из TouchDesigner → сайт')
    p.add_argument('source', help='ролик «белое на чёрном», например hero-loop.mp4')
    p.add_argument('--watch', action='store_true', help='пересобирать при каждом новом экспорте')
    p.add_argument('--crf', type=int, default=30, help='качество H.264: 26 — лучше, 34 — легче (по умолчанию 30)')
    a = p.parse_args()
    if not os.path.isfile(a.source):
        sys.exit(f'Не найден файл: {a.source}')
    try:
        watch(a.source, a.crf) if a.watch else build(a.source, a.crf)
    except KeyboardInterrupt:
        print()


if __name__ == '__main__':
    main()
