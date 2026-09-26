"""
Общее для роликов из TouchDesigner: жёсткий порог → H.264 → постер.
Используют prepare_hero.py и prepare_footer.py.
"""
import os
import subprocess
import sys

from PIL import Image

# порог по середине tv-диапазона (16..235): пиксель становится строго 16 или 235, цвет нейтральный
THRESHOLD = "format=yuv420p,lutyuv=y='if(gte(val,126),235,16)':u=128:v=128"


def ffmpeg(*args):
    try:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', *args], check=True)
    except FileNotFoundError:
        sys.exit('Нужен ffmpeg: brew install ffmpeg')


def encode(src, dst, crf):
    """Ролик → строго чёрно-белый H.264 без звука. Файл подменяется целиком: браузер не получит недописанный."""
    folder = os.path.dirname(dst)
    os.makedirs(folder, exist_ok=True)
    tmp = os.path.join(folder, '.tmp-' + os.path.basename(dst))
    ffmpeg('-i', src, '-vf', THRESHOLD, '-c:v', 'libx264', '-preset', 'slow', '-profile:v', 'high',
           '-crf', str(crf), '-pix_fmt', 'yuv420p', '-g', '24', '-movflags', '+faststart', '-an', tmp)
    os.replace(tmp, dst)


def poster(video, dst):
    """Первый кадр ролика → WebP без потерь (для двух цветов это в разы легче, чем с потерями). Возвращает (w, h)."""
    still = os.path.join(os.path.dirname(dst), '.poster.png')
    ffmpeg('-i', video, '-frames:v', '1', '-vf', 'format=gray', still)
    image = Image.open(still).convert('L').point(lambda v: 255 if v >= 128 else 0)
    image.save(dst, 'WEBP', lossless=True)
    os.remove(still)
    return image.size
