#!/usr/bin/env node
/* Шрифты для сборки на Vercel.

   Платных шрифтов в публичном репозитории нет (см. assets/fonts/README.md), поэтому при выкладке
   из GitHub Vercel скачивает их из хранилища Vercel Blob проекта. Адрес папки — в переменной
   окружения FONTS_URL в настройках проекта на Vercel; в репозитории его нет.

   Запускается сам: package.json → "vercel-build". Локально не нужен — шрифты уже лежат в assets/fonts/. */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FONTS = ['nhg-display-35.woff2', 'nhg-display-55.woff2', 'nhg-display-65.woff2', 'nhg-display-75.woff2'];
const dir = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'fonts');
const base = process.env.FONTS_URL;

if (!base) {
  console.log('FONTS_URL не задан — сайт соберётся без фирменного шрифта (текст системной гарнитурой).');
  process.exit(0);
}

await mkdir(dir, { recursive: true });
for (const name of FONTS) {
  const url = base.replace(/\/?$/, '/') + name;
  const r = await fetch(url);
  if (!r.ok) {
    console.error(`Не скачался ${name}: ${r.status} ${r.statusText}`);
    process.exit(1); // лучше остановить выкладку, чем выложить сайт без шрифта
  }
  await writeFile(join(dir, name), Buffer.from(await r.arrayBuffer()));
  console.log(`  ✓ ${name}`);
}
