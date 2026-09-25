# Шрифты

Файлы шрифтов в репозиторий не входят: Neue Haas Grotesk Display Pro (Monotype) и Punkbabe
(trial, «free for personal use only») распространяются по лицензии, а репозиторий публичный.

Сайт ждёт здесь пять файлов:

| файл | что это |
| --- | --- |
| `nhg-display-35.woff2` | Neue Haas Grotesk Display Pro 35 Extra Light (200) |
| `nhg-display-55.woff2` | 55 Roman (400) |
| `nhg-display-65.woff2` | 65 Medium (500) |
| `nhg-display-75.woff2` | 75 Bold (700) |
| `punkbabe.woff2` | Punkbabe — только для знака NASEKOLINA |

Собрать их из своих файлов:

```bash
pip install fonttools brotli
python3 tools/prepare_fonts.py "папка/Neue Haas Grotesk Display Pro Cyrillic" "путь/к/PUNKBABE.ttf"
```

Без этих файлов сайт работает, но набран системной гарнитурой (Helvetica Neue / Arial),
а знак на первом экране — обычным шрифтом. Для публикации сайта нужны веб-лицензии на оба шрифта.
