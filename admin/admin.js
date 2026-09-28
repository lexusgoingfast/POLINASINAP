/* Админка NASEKOLINA. Без зависимостей.

   Где хранится: всё содержимое сайта — data/works.js и img/ в GitHub-репозитории.
   Админка читает works.js, даёт править работы, кадры, проекты и «Подход»
   и сохраняет одним коммитом. Фото любого размера сжимаются прямо в браузере
   в три WebP (как tools/prepare_images.py): -l 2000 px, -s 800 px, -t 320 px.

   Два режима:
   — локально (python3 tools/serve.py): пишет файлы прямо в папку проекта;
   — на сайте: коммитит в GitHub от имени владельца токена. Без токена с правом
     записи в репозиторий сохранить ничего нельзя — это и есть доступ «только для нас». */
(() => {
  'use strict';

  const REPO = { owner: 'lexusgoingfast', name: 'POLINASINAP', branch: 'main' };
  const API = 'https://api.github.com';
  const SIZES = { l: { max: 2000, q: 0.82 }, s: { w: 800, q: 0.78 }, t: { w: 320, q: 0.72 } };
  const BG = '#eceae7'; // прозрачность ложится на тот же светлый фон, что в prepare_images.py
  const GRID = { '': 'Нет в сетке', s: 'Обычная', w: 'Широкая', l: 'Большая' };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const app = $('#app');
  const modal = $('#modal');

  const S = {
    mode: null, // 'local' | 'github'
    gh: { token: null, login: '', base: null },
    file: null, // { head, notes } — шапка и комментарии works.js
    site: null,
    works: [],
    pending: new Map(), // путь → Blob: новые файлы до сохранения
    removed: new Set(), // пути файлов, которые удалить при сохранении
    previews: new Map(), // src → objectURL превью новых кадров
    fresh: new Set(), // id работ, созданных в этой сессии (им ещё можно менять id)
    dirty: false,
    tab: 'works',
    sel: null,
    busy: false,
  };

  /* ── статус и кнопки ─────────────────────── */

  function status(text, kind = '') {
    const el = $('#status');
    el.textContent = text;
    el.dataset.kind = kind;
  }

  function touch() {
    S.dirty = true;
    syncActions();
  }

  function syncActions() {
    $('#save').disabled = !S.dirty || S.busy;
    $('#discard').disabled = !S.dirty || S.busy;
    const n = S.pending.size / 3;
    $('#save').textContent = S.busy ? 'Сохраняю…' : n ? `Сохранить (+${n} фото)` : 'Сохранить';
    if (S.dirty && !S.busy) status('Есть несохранённые правки');
  }

  addEventListener('beforeunload', (e) => {
    if (S.dirty) { e.preventDefault(); e.returnValue = ''; }
  });

  /* ── модель: индексы кадров ↔ src ─────────── */

  /* В works.js кадры в сетке, проектах и «Подходе» указаны номерами. В админке у каждого
     кадра свой ключ _k, и ссылки идут по нему — перестановка и удаление ничего не ломают;
     при сохранении ключи снова превращаются в номера. Ключ, а не путь к файлу: один файл
     бывает кадром сразу нескольких работ (лист лукбука — он же кадр вещи). */
  let seq = 0;
  const newKey = () => 'k' + seq++;

  function toModel(SITE, WORKS) {
    const works = clone(WORKS);
    const by = new Map(works.map((w) => [w.id, w]));
    for (const w of works) {
      w.images.forEach((im) => (im._k = newKey()));
      w.grid = (w.grid || []).filter((g) => w.images[g.i]).map((g) => ({ k: w.images[g.i]._k, size: g.size || 's' }));
    }
    const expand = (frames = []) =>
      frames.flatMap((f) => {
        const w = by.get(f.work);
        if (!w) return [];
        return (f.i || w.images.map((_, i) => i)).filter((i) => w.images[i]).map((i) => w.images[i]._k);
      });
    const site = clone(SITE);
    for (const p of site.projects || []) for (const st of p.stages) st.frames = expand(st.frames);
    for (const d of site.approach || []) d.frames = expand(d.frames);
    return { site, works };
  }

  const owner = (k) => S.works.find((w) => w.images.some((im) => im._k === k));
  const imageOf = (k) => { const w = owner(k); return w && w.images.find((im) => im._k === k); };

  function toFile() {
    const works = clone(S.works).map((w) => {
      const at = new Map(w.images.map((im, i) => [im._k, i]));
      w.grid = w.grid.filter((g) => at.has(g.k)).map((g) => ({ i: at.get(g.k), size: g.size }));
      w.images.forEach((im) => delete im._k);
      return w;
    });
    const index = new Map();
    for (const w of S.works) w.images.forEach((im, i) => index.set(im._k, { work: w.id, i }));
    const pack = (list) => {
      const out = [];
      for (const k of list) {
        const r = index.get(k);
        if (!r) continue;
        const last = out[out.length - 1];
        if (last && last.work === r.work) last.i.push(r.i);
        else out.push({ work: r.work, i: [r.i] });
      }
      // все кадры работы по порядку — короткая запись без i, как пишут руками
      for (const f of out) {
        const n = works.find((w) => w.id === f.work).images.length;
        if (f.i.length === n && f.i.every((v, k) => v === k)) delete f.i;
      }
      return out;
    };
    const site = clone(S.site);
    for (const p of site.projects || []) for (const st of p.stages) st.frames = pack(st.frames);
    for (const d of site.approach || []) d.frames = pack(d.frames);
    return WorksFile.stringify({ ...S.file, SITE: site, WORKS: works });
  }

  /* ── картинки: превью и сжатие ───────────── */

  const rawBase = () => `https://raw.githubusercontent.com/${REPO.owner}/${REPO.name}/${S.gh.base}/`;
  function preview(src, size = 's') {
    if (S.previews.has(src)) return S.previews.get(src);
    return (S.mode === 'github' ? rawBase() : '../') + src + '-' + size + '.webp';
  }

  function canvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
  }

  /* уменьшение ступенями по половине — заметно чище, чем одним шагом из 8000 px в 320 */
  function scaleTo(src, sw, sh, tw, th) {
    let cur = src, cw = sw, ch = sh;
    const draw = (c, from) => {
      const x = c.getContext('2d');
      x.fillStyle = BG;
      x.fillRect(0, 0, c.width, c.height);
      x.imageSmoothingEnabled = true;
      x.imageSmoothingQuality = 'high';
      x.drawImage(from, 0, 0, c.width, c.height);
      return c;
    };
    while (cw / 2 >= tw && ch / 2 >= th) {
      cur = draw(canvas(Math.round(cw / 2), Math.round(ch / 2)), cur);
      cw = cur.width; ch = cur.height;
    }
    return draw(canvas(tw, th), cur);
  }

  const encode = (c, q) =>
    new Promise((ok, fail) =>
      c.toBlob((b) => {
        if (!b || b.type !== 'image/webp') fail(new Error('Этот браузер не умеет сохранять WebP — откройте админку в Chrome'));
        else ok(b);
      }, 'image/webp', q));

  async function decode(file) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      const url = URL.createObjectURL(file);
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        return img;
      } catch {
        throw new Error(`«${file.name}»: браузер не может открыть этот формат. Сохраните фото как JPEG или PNG.`);
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  }

  async function process(file) {
    const bmp = await decode(file);
    const w = bmp.width || bmp.naturalWidth, h = bmp.height || bmp.naturalHeight;
    const k = Math.min(1, SIZES.l.max / Math.max(w, h));
    const L = scaleTo(bmp, w, h, Math.round(w * k), Math.round(h * k));
    const sw = Math.min(w, SIZES.s.w), sh = Math.round((h * sw) / w);
    const Sm = scaleTo(L.width >= sw ? L : bmp, L.width >= sw ? L.width : w, L.width >= sw ? L.height : h, sw, sh);
    const tw = Math.min(SIZES.t.w, sw), th = Math.round((sh * tw) / sw);
    const T = scaleTo(Sm, sw, sh, tw, th);
    bmp.close && bmp.close();
    const [l, s, t] = await Promise.all([encode(L, SIZES.l.q), encode(Sm, SIZES.s.q), encode(T, SIZES.t.q)]);
    return { w: L.width, h: L.height, l, s, t };
  }

  /* следующий свободный номер кадра в папке работы (не переиспользуем удалённые) */
  function nextNumber(w) {
    const used = [...w.images.map((im) => im.src), ...S.removed, ...S.pending.keys()]
      .map((p) => p.match(new RegExp(`^img/${w.id}/(\\d+)`)))
      .filter(Boolean)
      .map((m) => +m[1]);
    return (used.length ? Math.max(...used) : 0) + 1;
  }

  async function addFiles(w, files) {
    files = [...files].filter((f) => f.type.startsWith('image/') || /\.(heic|heif|tiff?)$/i.test(f.name));
    if (!files.length) return;
    S.busy = true;
    syncActions();
    const errors = [];
    for (const [n, f] of files.entries()) {
      status(`Сжимаю ${n + 1} из ${files.length}: ${f.name} (${(f.size / 1048576).toFixed(1)} МБ)`);
      try {
        const r = await process(f);
        const num = nextNumber(w);
        const src = `img/${w.id}/${String(num).padStart(2, '0')}`;
        S.pending.set(src + '-l.webp', r.l);
        S.pending.set(src + '-s.webp', r.s);
        S.pending.set(src + '-t.webp', r.t);
        S.previews.set(src, URL.createObjectURL(r.s));
        const im = { src, w: r.w, h: r.h, _k: newKey() };
        w.images.push(im);
        if (!w.grid.length) w.grid.push({ k: im._k, size: 's' });
        S.dirty = true;
        if (S.sel === w.id) renderImages(w);
      } catch (e) {
        errors.push(e.message);
      }
    }
    S.busy = false;
    syncActions();
    renderList();
    if (errors.length) status(errors.join(' · '), 'error');
    else status(`Готово: ${files.length} фото сжато. Не забудьте сохранить.`);
  }

  /* Кадр убирается из работы; файл — только если его не использует другая работа */
  function dropImage(w, key) {
    const k = w.images.findIndex((im) => im._k === key);
    if (k < 0) return;
    const { src } = w.images[k];
    w.images.splice(k, 1);
    w.grid = w.grid.filter((g) => g.k !== key);
    if (!S.works.some((x) => x.images.some((im) => im.src === src))) {
      for (const sz of ['l', 's', 't']) {
        const p = `${src}-${sz}.webp`;
        if (S.pending.has(p)) S.pending.delete(p);
        else S.removed.add(p);
      }
    }
    touch();
  }

  /* ── перетаскивание ──────────────────────── */

  /* Список, где элементы можно переставлять мышью. onMove(from, to) меняет массив. */
  function sortable(box, onMove) {
    let from = null;
    box.addEventListener('dragstart', (e) => {
      const it = e.target.closest('[data-k]');
      if (!it || it.parentElement !== box) return;
      from = +it.dataset.k;
      it.classList.add('is-drag');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(from));
    });
    box.addEventListener('dragend', () => {
      from = null;
      $$('.is-drag, .is-over', box).forEach((el) => el.classList.remove('is-drag', 'is-over'));
    });
    box.addEventListener('dragover', (e) => {
      if (from === null) return;
      e.preventDefault();
      const it = e.target.closest('[data-k]');
      $$('.is-over', box).forEach((el) => el !== it && el.classList.remove('is-over'));
      it && it.parentElement === box && it.classList.add('is-over');
    });
    box.addEventListener('drop', (e) => {
      if (from === null) return;
      e.preventDefault();
      const it = e.target.closest('[data-k]');
      if (!it || it.parentElement !== box) return;
      const to = +it.dataset.k;
      if (to !== from) onMove(from, to);
    });
  }

  const move = (arr, from, to) => arr.splice(to, 0, arr.splice(from, 1)[0]);

  /* ── вход ────────────────────────────────── */

  async function gh(path, opts = {}) {
    const r = await fetch(API + path, {
      ...opts,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${S.gh.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(opts.body ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      const err = new Error(body.message || r.statusText);
      err.status = r.status;
      throw err;
    }
    return opts.raw ? r.text() : r.json();
  }

  function renderLogin(msg = '') {
    $('#tabs').hidden = true;
    $('#actions').hidden = true;
    app.innerHTML = `
      <section class="login">
        <h1>Вход</h1>
        <p>Админка сохраняет изменения прямо в GitHub-репозиторий сайта
          <b>${esc(REPO.owner)}/${esc(REPO.name)}</b>. Войти может только тот, у кого есть право записи в него.</p>
        <ol>
          <li>Откройте <a href="https://github.com/settings/tokens/new?scopes=public_repo&description=NASEKOLINA%20admin" target="_blank" rel="noopener">создание токена на GitHub</a>
            (галочка <b>public_repo</b> уже стоит, срок — на ваше усмотрение).</li>
          <li>Нажмите «Generate token» и скопируйте его.</li>
          <li>Вставьте сюда. Токен хранится только в этом браузере.</li>
        </ol>
        <form id="login-form">
          <input type="password" id="token" placeholder="ghp_…" autocomplete="off" required>
          <button class="btn btn--main" type="submit">Войти</button>
        </form>
        ${msg ? `<p class="login-err">${esc(msg)}</p>` : ''}
        <p class="muted">Работаете с копией проекта на своём компьютере? Запустите <code>python3 tools/serve.py</code>
          и откройте <code>http://localhost:4173/admin/</code> — там вход не нужен.</p>
      </section>`;
    $('#login-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      S.gh.token = $('#token').value.trim();
      await loginGithub();
    });
  }

  async function loginGithub() {
    status('Проверяю доступ…');
    try {
      const [user, repo] = await Promise.all([gh('/user'), gh(`/repos/${REPO.owner}/${REPO.name}`)]);
      if (!repo.permissions || !repo.permissions.push) {
        localStorage.removeItem('nk:token');
        return renderLogin(`У аккаунта ${user.login} нет права записи в репозиторий.`);
      }
      S.gh.login = user.login;
      try { localStorage.setItem('nk:token', S.gh.token); } catch { /* приватный режим */ }
      await loadGithub();
    } catch (e) {
      try { localStorage.removeItem('nk:token'); } catch { /* ничего */ }
      renderLogin(e.status === 401 ? 'GitHub не принял токен — проверьте, что он скопирован целиком.' : e.message);
    }
  }

  async function loadGithub() {
    const ref = await gh(`/repos/${REPO.owner}/${REPO.name}/git/ref/heads/${REPO.branch}`);
    S.gh.base = ref.object.sha;
    const text = await gh(`/repos/${REPO.owner}/${REPO.name}/contents/data/works.js?ref=${S.gh.base}`, {
      raw: true,
      headers: { Accept: 'application/vnd.github.raw' },
    });
    load(text);
    status(`Вы вошли как ${S.gh.login}. Правки сохраняются коммитом в GitHub.`);
  }

  async function loadLocal() {
    const text = await (await fetch('../data/works.js', { cache: 'no-store' })).text();
    load(text);
    status('Локальный режим: правки сохраняются в папку проекта.');
  }

  function load(text) {
    const f = WorksFile.parse(text);
    S.file = { head: f.head, notes: f.notes };
    Object.assign(S, toModel(f.SITE, f.WORKS));
    S.pending.clear();
    S.removed.clear();
    S.fresh.clear();
    S.dirty = false;
    if (!S.works.some((w) => w.id === S.sel)) S.sel = S.works[0] && S.works[0].id;
    $('#tabs').hidden = false;
    $('#actions').hidden = false;
    syncActions();
    render();
  }

  /* ── сохранение ──────────────────────────── */

  function problems() {
    const out = [];
    for (const w of S.works) {
      if (!/^[a-z0-9-]+$/.test(w.id)) out.push(`id «${w.id}»: только латиница, цифры и дефис`);
      if (!w.images.length) out.push(`«${w.title || w.id}»: нет ни одного кадра`);
    }
    const ids = S.works.map((w) => w.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dup.length) out.push('повторяются id: ' + [...new Set(dup)].join(', '));
    return out;
  }

  const b64 = (blob) =>
    new Promise((ok) => {
      const r = new FileReader();
      r.onload = () => ok(String(r.result).split(',')[1]);
      r.readAsDataURL(blob);
    });

  async function save() {
    const bad = problems();
    if (bad.length) return status('Не сохранено: ' + bad.join(' · '), 'error');
    S.busy = true;
    syncActions();
    try {
      const text = toFile();
      if (S.mode === 'local') await saveLocal(text);
      else await saveGithub(text);
      S.pending.clear();
      S.removed.clear();
      S.fresh.clear();
      S.dirty = false;
      S.busy = false;
      syncActions();
      render();
      status(S.mode === 'local'
        ? 'Сохранено в папку проекта. Осталось git commit и push.'
        : 'Сохранено в GitHub. Сайт обновится после выкладки.', 'ok');
    } catch (e) {
      S.busy = false;
      syncActions();
      status('Не сохранено: ' + e.message, 'error');
    }
  }

  async function saveLocal(text) {
    const files = [{ path: 'data/works.js', text }];
    let n = 0;
    for (const [path, blob] of S.pending) {
      status(`Готовлю файлы: ${++n} из ${S.pending.size}`);
      files.push({ path, base64: await b64(blob) });
    }
    status('Сохраняю…');
    const r = await fetch('/__admin/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files, remove: [...S.removed] }),
    });
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText);
  }

  /* Один коммит через Git Data API: blobs → tree → commit → ref.
     Если пока мы правили, в main пришли чужие коммиты: works.js в них не менялся —
     кладём свой коммит поверх; менялся — останавливаемся, чтобы не затереть чужие правки. */
  async function saveGithub(text) {
    const repo = `/repos/${REPO.owner}/${REPO.name}`;
    const ref = await gh(`${repo}/git/ref/heads/${REPO.branch}`);
    let parent = S.gh.base;
    if (ref.object.sha !== S.gh.base) {
      const cmp = await gh(`${repo}/compare/${S.gh.base}...${ref.object.sha}`);
      if (cmp.files.some((f) => f.filename === 'data/works.js')) {
        throw new Error('кто-то уже изменил содержимое сайта на GitHub. Скопируйте свои правки, перезагрузите страницу и повторите.');
      }
      parent = ref.object.sha;
    }
    const head = await gh(`${repo}/git/commits/${parent}`);

    const tree = [];
    let n = 0;
    for (const [path, blob] of S.pending) {
      status(`Загружаю фото: ${++n} из ${S.pending.size}`);
      const r = await gh(`${repo}/git/blobs`, { method: 'POST', body: JSON.stringify({ content: await b64(blob), encoding: 'base64' }) });
      tree.push({ path, mode: '100644', type: 'blob', sha: r.sha });
    }
    status('Сохраняю…');
    tree.push({ path: 'data/works.js', mode: '100644', type: 'blob', content: text });

    // удаляем только то, что действительно есть в репозитории
    if (S.removed.size) {
      const all = await gh(`${repo}/git/trees/${head.tree.sha}?recursive=1`);
      const have = new Set(all.tree.map((t) => t.path));
      for (const p of S.removed) if (have.has(p)) tree.push({ path: p, mode: '100644', type: 'blob', sha: null });
    }

    const t = await gh(`${repo}/git/trees`, { method: 'POST', body: JSON.stringify({ base_tree: head.tree.sha, tree }) });
    const photos = S.pending.size / 3;
    const msg = ['Админка: правки содержимого', photos ? `+${photos} фото` : '', S.removed.size ? `−${S.removed.size / 3} фото` : '']
      .filter(Boolean).join(', ');
    const c = await gh(`${repo}/git/commits`, { method: 'POST', body: JSON.stringify({ message: msg, tree: t.sha, parents: [parent] }) });
    await gh(`${repo}/git/refs/heads/${REPO.branch}`, { method: 'PATCH', body: JSON.stringify({ sha: c.sha }) });
    S.gh.base = c.sha;
  }

  /* ── отрисовка ───────────────────────────── */

  function render() {
    $$('#tabs button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.tab === S.tab)));
    if (S.tab === 'works') renderWorks();
    else if (S.tab === 'texts') renderTexts();
    else renderGroups(S.tab);
  }

  const cover = (w) => {
    const g = w.grid[0] && w.images.find((im) => im._k === w.grid[0].k);
    return (g || w.images[0] || {}).src;
  };
  const titleOf = (w) => w.title || 'Без названия';
  const thumb = (src, cls = '') => (src ? `<img class="${cls}" src="${esc(preview(src))}" alt="" loading="lazy">` : '<span class="ph"></span>');

  /* Работы: список слева, редактор справа */
  function renderWorks() {
    app.oninput = app.onclick = null;
    app.innerHTML = `
      <div class="works">
        <aside class="w-side">
          <button type="button" class="btn btn--wide" id="w-new">+ Новая работа</button>
          <p class="hint">Порядок здесь — порядок плиток в архиве. Перетаскивайте.</p>
          <ol class="w-list" id="w-list"></ol>
        </aside>
        <section class="w-edit" id="w-edit"></section>
      </div>`;
    renderList();
    renderEditor();
    $('#w-new').addEventListener('click', newWork);
    const list = $('#w-list');
    sortable(list, (a, b) => { move(S.works, a, b); touch(); renderList(); });
    list.addEventListener('click', (e) => {
      const li = e.target.closest('[data-id]');
      if (!li) return;
      S.sel = li.dataset.id;
      renderList();
      renderEditor();
    });
  }

  function renderList() {
    const list = $('#w-list');
    if (!list) return;
    list.innerHTML = S.works.map((w, k) => `
      <li draggable="true" data-k="${k}" data-id="${esc(w.id)}" aria-current="${w.id === S.sel}">
        ${thumb(cover(w))}
        <span><b>${esc(titleOf(w))}</b><small>${esc(w.category)} · ${w.images.length} кадр.</small></span>
      </li>`).join('');
  }

  const FIELDS = [
    ['title', 'Название'],
    ['category', 'Категория'],
    ['project', 'Проект / бренд'],
    ['collection', 'Коллекция'],
    ['year', 'Год'],
  ];

  function renderEditor() {
    const box = $('#w-edit');
    const w = S.works.find((x) => x.id === S.sel);
    if (!w) { box.innerHTML = '<p class="muted">Выберите работу слева.</p>'; return; }
    const cats = [...new Set(S.works.map((x) => x.category).filter(Boolean))];
    const idEditable = S.fresh.has(w.id) && !w.images.length;
    box.innerHTML = `
      <div class="w-head">
        <h2>${esc(titleOf(w))}</h2>
        <a class="btn" href="../#/${esc(w.id)}/0" target="_blank" rel="noopener">Открыть на сайте ↗</a>
        <button type="button" class="btn btn--danger" id="w-del">Удалить работу</button>
      </div>
      <div class="form">
        <label><span>id (в ссылке)</span><input name="id" value="${esc(w.id)}" ${idEditable ? '' : 'readonly'} pattern="[a-z0-9-]+"></label>
        ${FIELDS.map(([k, label]) => `<label><span>${label}</span><input name="${k}" value="${esc(w[k])}" ${k === 'category' ? 'list="cats"' : ''}></label>`).join('')}
        <label class="wide"><span>Описание</span><textarea name="description" rows="3">${esc(w.description)}</textarea></label>
        <label class="wide"><span>Материалы и техники — по одной на строку</span><textarea name="details" rows="3">${esc(w.details.join('\n'))}</textarea></label>
        <datalist id="cats">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      </div>
      <div class="imgs" id="imgs">
        <div class="imgs-head">
          <h3>Кадры <span id="imgs-n"></span></h3>
          <label class="btn btn--main">+ Загрузить фото<input type="file" id="upload" accept="image/*,.heic,.heif,.tif,.tiff" multiple hidden></label>
        </div>
        <p class="hint">Перетащите фото сюда — любого размера, сожмутся сами. Кадры переставляются мышью.
          ★ — обложка работы в архиве (первая плитка). «Сетка» — показывать ли кадр отдельной плиткой в архиве.</p>
        <ol class="cards" id="cards"></ol>
      </div>`;

    $('.form', box).addEventListener('input', (e) => {
      const el = e.target;
      if (el.name === 'id') {
        const v = el.value.trim();
        if (/^[a-z0-9-]+$/.test(v) && !S.works.some((x) => x !== w && x.id === v)) {
          S.fresh.delete(w.id); w.id = v; S.fresh.add(v); S.sel = v;
        }
      } else if (el.name === 'details') w.details = el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      else w[el.name] = el.value;
      touch();
      if (el.name === 'title' || el.name === 'category') {
        $('.w-head h2', box).textContent = titleOf(w);
        renderList();
      }
    });
    $('#w-del').addEventListener('click', () => deleteWork(w));
    $('#upload').addEventListener('change', (e) => { addFiles(w, e.target.files); e.target.value = ''; });

    const zone = $('#imgs');
    zone.addEventListener('dragover', (e) => {
      if (![...e.dataTransfer.types].includes('Files')) return;
      e.preventDefault();
      zone.classList.add('is-drop');
    });
    zone.addEventListener('dragleave', (e) => { if (!zone.contains(e.relatedTarget)) zone.classList.remove('is-drop'); });
    zone.addEventListener('drop', (e) => {
      if (!e.dataTransfer.files.length) return;
      e.preventDefault();
      zone.classList.remove('is-drop');
      addFiles(w, e.dataTransfer.files);
    });

    const cards = $('#cards');
    sortable(cards, (a, b) => { move(w.images, a, b); touch(); renderImages(w); });
    cards.addEventListener('click', (e) => {
      const b = e.target.closest('button[data-act]');
      if (!b) return;
      const key = b.closest('[data-key]').dataset.key;
      if (b.dataset.act === 'cover') {
        const g = w.grid.find((x) => x.k === key) || { k: key, size: 's' };
        w.grid = [g, ...w.grid.filter((x) => x.k !== key)];
      } else if (b.dataset.act === 'del') {
        if (!confirm('Удалить кадр? Он пропадёт и из проектов, и из «Подхода».')) return;
        dropImage(w, key);
      }
      touch();
      renderImages(w);
      renderList();
    });
    cards.addEventListener('change', (e) => {
      const el = e.target;
      const key = el.closest('[data-key]').dataset.key;
      if (el.name === 'size') {
        const g = w.grid.find((x) => x.k === key);
        if (!el.value) w.grid = w.grid.filter((x) => x.k !== key);
        else if (g) g.size = el.value;
        else w.grid.push({ k: key, size: el.value });
        renderImages(w);
        renderList();
      }
      touch();
    });
    cards.addEventListener('input', (e) => {
      if (e.target.name !== 'caption') return;
      const im = w.images.find((x) => x._k === e.target.closest('[data-key]').dataset.key);
      if (e.target.value) im.caption = e.target.value; else delete im.caption;
      touch();
    });
    renderImages(w);
  }

  function renderImages(w) {
    const cards = $('#cards');
    if (!cards) return;
    $('#imgs-n').textContent = `[${w.images.length}]`;
    const first = w.grid[0] && w.grid[0].k;
    cards.innerHTML = w.images.map((im, k) => {
      const g = w.grid.find((x) => x.k === im._k);
      const fresh = S.previews.has(im.src);
      return `
        <li draggable="true" data-k="${k}" data-key="${im._k}" class="${im._k === first ? 'is-cover' : ''}">
          <figure>${thumb(im.src)}<span class="c-n">${String(k + 1).padStart(2, '0')}${fresh ? ' · новый' : ''}</span></figure>
          <div class="c-row">
            <button type="button" data-act="cover" class="c-star" title="Сделать обложкой" aria-pressed="${im._k === first}">★</button>
            <select name="size" title="Плитка в архиве">${Object.entries(GRID).map(([v, t]) => `<option value="${v}" ${(g ? g.size : '') === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
            <button type="button" data-act="del" class="c-del" title="Удалить кадр">✕</button>
          </div>
          <input name="caption" placeholder="Подпись к кадру" value="${esc(im.caption)}">
        </li>`;
    }).join('') || '<li class="empty">Кадров пока нет — загрузите фото.</li>';
  }

  function translit(s) {
    const map = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
    return s.toLowerCase().split('').map((c) => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function newWork() {
    const title = prompt('Название новой работы:');
    if (title === null) return;
    let id = translit(title) || 'work';
    for (let n = 2; S.works.some((w) => w.id === id); n++) id = `${translit(title) || 'work'}-${n}`;
    const w = { id, title: title.trim(), category: 'Вещь', project: 'кандиль синап', collection: '', year: '', description: '', details: [], images: [], grid: [] };
    S.works.unshift(w);
    S.fresh.add(id);
    S.sel = id;
    touch();
    renderWorks();
    status('Новая работа добавлена первой. Загрузите фото и сохраните.');
  }

  function deleteWork(w) {
    if (!confirm(`Удалить «${titleOf(w)}» со всеми кадрами? Кадры пропадут и из проектов, и из «Подхода».`)) return;
    S.works = S.works.filter((x) => x !== w);
    // файлы работы удаляем, если их не использует другая работа
    for (const im of w.images) {
      if (S.works.some((x) => x.images.some((o) => o.src === im.src))) continue;
      for (const sz of ['l', 's', 't']) {
        const p = `${im.src}-${sz}.webp`;
        if (S.pending.has(p)) S.pending.delete(p); else S.removed.add(p);
      }
    }
    S.sel = S.works[0] && S.works[0].id;
    touch();
    renderWorks();
  }

  /* Тексты сайта: шапка, «О Полине», контакты */
  function renderTexts() {
    const site = S.site;
    app.innerHTML = `
      <div class="groups texts">
        <p class="hint">Тексты проектов и направлений правятся на вкладках «Проекты» и «Подход».</p>
        <article class="group">
          <div class="g-head"><h2>Первый экран</h2></div>
          <div class="form">
            <label><span>Имя</span><input data-t="name" value="${esc(site.name)}"></label>
            <label><span>Проект / бренд (подвал, контакты)</span><input data-t="project" value="${esc(site.project)}"></label>
            <label class="wide"><span>Красный абзац в шапке</span><textarea data-t="intro" rows="4">${esc(site.intro)}</textarea></label>
          </div>
        </article>
        <article class="group">
          <div class="g-head"><h2>О Полине</h2></div>
          <div class="form">
            <label class="wide"><span>Абзацы — через пустую строку. *Звёздочки* выделяют слово красным.</span>
              <textarea data-t="about" rows="6">${esc(site.about.join('\n\n'))}</textarea></label>
          </div>
        </article>
        <article class="group">
          <div class="g-head"><h2>Контакты</h2></div>
          <div class="form">
            <label class="wide"><span>Telegram — ссылка в меню и кнопка «Обсудить»</span><input data-t="telegram" value="${esc(site.telegram)}"></label>
          </div>
          <p class="hint">Первая строка — крупная ссылка в разделе «Контакты». Для почты ссылка вида mailto:name@mail.ru</p>
          ${site.contacts.map((c, k) => `
            <div class="form contact-row" data-c="${k}">
              <label><span>Подпись</span><input data-cf="label" value="${esc(c.label)}" placeholder="Почта"></label>
              <label><span>Текст</span><input data-cf="text" value="${esc(c.text)}" placeholder="name@mail.ru"></label>
              <label><span>Ссылка</span><input data-cf="href" value="${esc(c.href)}" placeholder="mailto:name@mail.ru"></label>
              <button type="button" class="btn btn--danger" data-act="del-contact" ${site.contacts.length > 1 ? '' : 'disabled'}>Удалить</button>
            </div>`).join('')}
          <button type="button" class="btn" data-act="add-contact">+ Контакт</button>
        </article>
      </div>`;

    app.oninput = (e) => {
      const el = e.target;
      if (el.dataset.t === 'about') site.about = el.value.split(/\n\s*\n/).map((p) => p.trim().replace(/\s*\n\s*/g, ' ')).filter(Boolean);
      else if (el.dataset.t) site[el.dataset.t] = el.value;
      else if (el.dataset.cf) site.contacts[+el.closest('[data-c]').dataset.c][el.dataset.cf] = el.value.trim();
      else return;
      touch();
    };
    app.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'add-contact') site.contacts.push({ label: '', text: '', href: '' });
      else if (b.dataset.act === 'del-contact') site.contacts.splice(+b.closest('[data-c]').dataset.c, 1);
      else return;
      touch();
      renderTexts();
    };
  }

  /* Проекты и «Подход»: у проекта этапы, у направления — сразу лента кадров */
  function renderGroups(tab) {
    const isP = tab === 'projects';
    const items = isP ? S.site.projects : S.site.approach;
    app.innerHTML = `
      <div class="groups">
        <p class="hint">${isP
          ? 'Проект — путь от эскиза до результата. Первый кадр этапа — его обложка на сайте. Кадры переставляются мышью.'
          : 'Направления «Подхода». Первый кадр — начало ленты на сайте. Кадры переставляются мышью.'}</p>
        ${items.map((it, k) => `
          <article class="group" data-g="${k}">
            <div class="g-head">
              <h2>${esc(it.title)}</h2>
              <span class="g-tools">
                <button type="button" class="btn" data-act="up" ${k ? '' : 'disabled'}>↑</button>
                <button type="button" class="btn" data-act="down" ${k < items.length - 1 ? '' : 'disabled'}>↓</button>
                <a class="btn" href="../#/${esc(it.id)}/0" target="_blank" rel="noopener">На сайте ↗</a>
                <button type="button" class="btn btn--danger" data-act="del-group">Удалить</button>
              </span>
            </div>
            <div class="form">
              <label><span>Название</span><input data-f="title" value="${esc(it.title)}"></label>
              ${isP ? `<label><span>Подпись (проект · год)</span><input data-f="meta" value="${esc(it.meta)}"></label>` : ''}
              <label class="wide"><span>Текст</span><textarea data-f="text" rows="2">${esc(it.text)}</textarea></label>
              ${isP ? '' : `<label><span>Пока нет кадров — плашка</span><input data-f="soon" value="${esc(it.soon)}" placeholder="Скоро: …"></label>`}
            </div>
            ${isP
              ? `${it.stages.map((st, s) => `
                  <div class="stage" data-s="${s}">
                    <div class="form">
                      <label><span>Этап ${String(s + 1).padStart(2, '0')}</span><input data-sf="title" value="${esc(st.title)}"></label>
                      <label class="wide"><span>Текст этапа</span><input data-sf="text" value="${esc(st.text)}"></label>
                      <label><span>Пока нет кадров — плашка</span><input data-sf="soon" value="${esc(st.soon)}" placeholder="Скоро"></label>
                    </div>
                    ${strip(st.frames)}
                    <span class="g-tools">
                      <button type="button" class="btn" data-act="stage-up" ${s ? '' : 'disabled'}>↑ этап</button>
                      <button type="button" class="btn" data-act="stage-down" ${s < it.stages.length - 1 ? '' : 'disabled'}>↓ этап</button>
                      <button type="button" class="btn btn--danger" data-act="del-stage">Удалить этап</button>
                    </span>
                  </div>`).join('')}
                <button type="button" class="btn" data-act="add-stage">+ Этап</button>`
              : strip(it.frames)}
          </article>`).join('')}
        <button type="button" class="btn btn--main" id="g-new">${isP ? '+ Новый проект' : '+ Новое направление'}</button>
      </div>`;

    const groupOf = (el) => items[+el.closest('[data-g]').dataset.g];
    const stageOf = (el) => groupOf(el).stages[+el.closest('[data-s]').dataset.s];
    const listOf = (el) => (el.closest('[data-s]') ? stageOf(el).frames : groupOf(el).frames);

    // обработчики — свойствами: перерисовка их заменяет, а не копит
    app.oninput = (e) => {
      const el = e.target;
      if (el.dataset.f) {
        const it = groupOf(el);
        if (el.value || el.dataset.f !== 'soon') it[el.dataset.f] = el.value; else delete it.soon;
        if (el.dataset.f === 'title') $('.g-head h2', el.closest('[data-g]')).textContent = el.value;
      } else if (el.dataset.sf) {
        const st = stageOf(el);
        if (el.value || el.dataset.sf !== 'soon') st[el.dataset.sf] = el.value; else delete st.soon;
      } else return;
      touch();
    };

    app.onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (b) {
        const act = b.dataset.act;
        if (act === 'up' || act === 'down') { const k = +b.closest('[data-g]').dataset.g; move(items, k, k + (act === 'up' ? -1 : 1)); }
        else if (act === 'del-group') { if (!confirm(`Удалить «${groupOf(b).title}»? Работы и кадры останутся.`)) return; items.splice(+b.closest('[data-g]').dataset.g, 1); }
        else if (act === 'add-stage') groupOf(b).stages.push({ title: 'Новый этап', text: '', frames: [] });
        else if (act === 'stage-up' || act === 'stage-down') { const s = +b.closest('[data-s]').dataset.s; move(groupOf(b).stages, s, s + (act === 'stage-up' ? -1 : 1)); }
        else if (act === 'del-stage') { if (!confirm('Удалить этап?')) return; groupOf(b).stages.splice(+b.closest('[data-s]').dataset.s, 1); }
        else if (act === 'frame-del') { const l = listOf(b); l.splice(+b.closest('[data-k]').dataset.k, 1); }
        else if (act === 'frames-add') return pick(listOf(b), () => renderGroups(tab));
        else return;
        touch();
        renderGroups(tab);
      }
    };

    $$('.strip', app).forEach((box) => sortable(box, (a, b2) => { move(listOf(box), a, b2); touch(); renderGroups(tab); }));

    $('#g-new').addEventListener('click', () => {
      const title = prompt(isP ? 'Название проекта:' : 'Название направления:');
      if (!title) return;
      let id = translit(title) || 'item';
      const taken = (x) => S.works.some((w) => w.id === x) || [...S.site.projects, ...S.site.approach].some((g) => g.id === x);
      for (let n = 2; taken(id); n++) id = `${translit(title) || 'item'}-${n}`;
      items.push(isP
        ? { id, title, meta: '', text: '', stages: [{ title: 'Эскизы', text: '', frames: [] }] }
        : { id, title, text: '', frames: [] });
      touch();
      renderGroups(tab);
    });
  }

  function strip(frames) {
    return `
      <div class="frames">
        <ol class="strip">${frames.map((key, k) => {
          const w = owner(key);
          const im = imageOf(key);
          return `<li draggable="true" data-k="${k}" title="${esc(w ? titleOf(w) : '')}">${thumb(im && im.src)}<button type="button" data-act="frame-del" aria-label="Убрать кадр">✕</button></li>`;
        }).join('')}</ol>
        <button type="button" class="btn" data-act="frames-add">+ Кадры</button>
      </div>`;
  }

  /* Выбор кадров из всех работ: клик — отметить, «Добавить» — в конец ленты */
  function pick(list, done) {
    const chosen = [];
    modal.hidden = false;
    modal.innerHTML = `
      <div class="m-box">
        <div class="m-head">
          <input type="search" id="m-q" placeholder="Поиск по названию работы">
          <button type="button" class="btn btn--main" id="m-ok">Добавить</button>
          <button type="button" class="btn" id="m-x">Отмена</button>
        </div>
        <div class="m-body" id="m-body">
          ${S.works.map((w) => `
            <section data-t="${esc((titleOf(w) + ' ' + w.id).toLowerCase())}">
              <h3>${esc(titleOf(w))}</h3>
              <ol>${w.images.map((im) => `<li><button type="button" data-key="${im._k}" class="${list.includes(im._k) ? 'is-in' : ''}">${thumb(im.src)}</button></li>`).join('')}</ol>
            </section>`).join('')}
        </div>
      </div>`;
    const close = () => { modal.hidden = true; modal.innerHTML = ''; };
    $('#m-x').onclick = close;
    $('#m-ok').onclick = () => {
      if (chosen.length) { list.push(...chosen); touch(); }
      close();
      done();
    };
    $('#m-q').oninput = (e) => {
      const q = e.target.value.trim().toLowerCase();
      $$('#m-body section').forEach((s) => (s.hidden = q && !s.dataset.t.includes(q)));
    };
    $('#m-body').onclick = (e) => {
      const b = e.target.closest('button[data-key]');
      if (!b) return;
      const k = chosen.indexOf(b.dataset.key);
      if (k < 0) chosen.push(b.dataset.key); else chosen.splice(k, 1);
      b.classList.toggle('is-picked', k < 0);
      $$('#m-body .is-picked').forEach((x) => (x.dataset.n = chosen.indexOf(x.dataset.key) + 1));
      $('#m-ok').textContent = chosen.length ? `Добавить (${chosen.length})` : 'Добавить';
    };
    $('#m-q').focus();
  }

  /* ── старт ───────────────────────────────── */

  $('#tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-tab]');
    if (!b) return;
    S.tab = b.dataset.tab;
    render();
  });
  $('#save').addEventListener('click', save);
  $('#discard').addEventListener('click', () => {
    if (!confirm('Отменить все несохранённые правки?')) return;
    S.dirty = false;
    if (S.mode === 'local') loadLocal(); else loadGithub();
  });

  (async () => {
    // локальный режим — только когда админка открыта на этом же компьютере через tools/serve.py
    const onThisMachine = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
    const local = onThisMachine && (await fetch('/__admin/ping', { cache: 'no-store' }).then((r) => r.ok && r.json()).catch(() => null));
    if (local && local.mode === 'local') {
      S.mode = 'local';
      return loadLocal().catch((e) => status('Не удалось прочитать data/works.js: ' + e.message, 'error'));
    }
    S.mode = 'github';
    try { S.gh.token = localStorage.getItem('nk:token'); } catch { /* приватный режим */ }
    if (S.gh.token) loginGithub(); else renderLogin();
  })();
})();
