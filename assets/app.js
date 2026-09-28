/* Полина Кузьмина — архив. Без зависимостей. Данные: data/works.js */
(() => {
  'use strict';

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const pad = (n) => String(n).padStart(2, '0');
  const brand = (s) => esc(s).replace(/кандиль синап/g, '<span class="brand">кандиль синап</span>');

  /* Единственная стрелка сайта — Forma Icons, line / arrow-right (спрайт #i-arrow в index.html);
     остальные направления получаются поворотом. «→» в текстах работ превращается в неё же. */
  const arrow = (deg = 0) =>
    `<svg class="arrow" viewBox="0 0 48 48" aria-hidden="true"><use href="#i-arrow"${deg ? ` transform="rotate(${deg} 24 24)"` : ''}/></svg>`;
  const rich = (s) => esc(s).replace(/→/g, arrow());

  const store = {
    get(k) { try { return localStorage.getItem('pk:' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('pk:' + k, v); } catch { /* приватный режим */ } },
  };

  const byId = new Map(WORKS.map((w, n) => [w.id, Object.assign(w, { n: n + 1 })]));
  const titleOf = (w) => w.title || 'Без названия';
  const small = (src) => src + '-s.webp';
  const large = (src) => src + '-l.webp';
  const touch = matchMedia('(hover: none)').matches;

  /* Проект и направления «Подхода» открываются в том же просмотре, что и работы:
     собираем из их кадров «работу» со своим id, каждый кадр помнит, откуда он. */
  const collect = (frames) =>
    frames.flatMap((f) => {
      const w = byId.get(f.work);
      if (!w) return [];
      return (f.i || w.images.map((_, i) => i))
        .filter((i) => w.images[i])
        .map((i) => ({ ...w.images[i], from: { w, i } }));
    });

  const DIRS = SITE.approach.map((d, k) => {
    const images = collect(d.frames);
    return {
      ...d,
      dir: true,
      n: k + 1,
      category: 'Подход',
      description: d.text,
      images,
      works: [...new Set(images.map((im) => im.from.w))],
    };
  });
  DIRS.forEach((d) => d.images.length && byId.set(d.id, d));

  /* Проекты: кадры всех этапов подряд; этап помнит, с какого кадра он начинается */
  const PROJECTS = SITE.projects.map((P, n) => {
    let start = 0;
    const stages = P.stages.map((st, k) => {
      const images = collect(st.frames).map((im) => ({ ...im, stage: k }));
      const out = { ...st, n: k + 1, start, images };
      start += images.length;
      return out;
    });
    return {
      ...P,
      project: true,
      n: n + 1,
      category: 'Проект',
      description: P.text,
      stages,
      images: stages.flatMap((st) => st.images),
    };
  });
  PROJECTS.forEach((p) => byId.set(p.id, p));

  /* ── тексты ─────────────────────────────── */

  $('#intro').innerHTML = brand(SITE.intro);
  $('#nav-count').textContent = `[${WORKS.length}]`;
  $('#nav-tg').href = SITE.telegram;
  $('#v-cta').href = SITE.telegram;
  $('#hero-name').textContent = `[${SITE.name}]`;
  $('#hero-project').innerHTML = `[Дизайнер одежды и костюма]`;

  const years = WORKS.map((w) => parseInt(w.year, 10)).filter(Boolean);
  if (years.length) {
    const a = Math.min(...years), b = Math.max(...years);
    $('#hero-years').textContent = `[Архив ${a === b ? a : a + '—' + b}]`;
  }
  $('#foot-copy').innerHTML = `© ${new Date().getFullYear()} ${esc(SITE.name)} — ${brand(SITE.project)}`;

  /* ── сетка архива ───────────────────────── */

  const grid = $('#grid');

  /* Главная плитка работы стоит на своём месте, дополнительные кадры
     всплывают дальше по сетке — как детали, к которым архив возвращается. */
  const order = WORKS.flatMap((w) =>
    w.grid.map((g, k) => ({ w, g, k, key: k === 0 ? w.n * 10 : (w.n + 3 + k * 2) * 10 + 5 }))
  ).sort((a, b) => a.key - b.key);

  grid.innerHTML = order.map(({ w, g, k }) => {
      const img = w.images[g.i] || w.images[0];
      const meta = [w.collection, w.year].filter(Boolean).join(', ');
      return `
      <li class="tile size-${g.size || 's'}" data-cat="${esc(w.category)}" data-year="${esc(w.year || '—')}">
        <a href="#/${w.id}/${g.i}" aria-label="${esc(titleOf(w))}${meta ? ', ' + esc(meta) : ''}">
          <img class="t-neg" src="${small(img.src)}" alt="" loading="${w.n < 8 ? 'eager' : 'lazy'}" decoding="async">
          <img class="t-orig" src="${small(img.src)}" alt="" loading="lazy" decoding="async">
          <span class="t-cap">
            <span>[${esc(w.category)}]</span>
            <span class="t-title">${esc(titleOf(w))}</span>
            ${meta ? `<span class="t-meta">${esc(meta)}</span>` : ''}
          </span>
        </a>
      </li>`;
  }).join('');

  /* Разбор кадра на маленьком холсте:
     1) средняя яркость → сила засветки перед инверсией (как в референсе:
        светлые фото уходят в глубокий чёрный). */
  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d', { willReadFrequently: true });

  function analyse(img, aspect) {
    try {
      const W = 24, H = Math.round(24 / aspect);
      probe.width = W; probe.height = H;
      const iw = img.naturalWidth, ih = img.naturalHeight;
      let sw = iw, sh = ih;
      if (iw / ih > aspect) sw = ih * aspect; else sh = iw / aspect; // как object-fit: cover
      pctx.drawImage(img, (iw - sw) / 2, (ih - sh) / 2, sw, sh, 0, 0, W, H);
      const d = pctx.getImageData(0, 0, W, H).data;
      const L = new Float32Array(W * H);
      let sum = 0;
      for (let k = 0; k < L.length; k++) {
        L[k] = (0.2126 * d[k * 4] + 0.7152 * d[k * 4 + 1] + 0.0722 * d[k * 4 + 2]) / 255;
        sum += L[k];
      }
      const b = Math.min(3.25, Math.max(1.15, 0.8 / Math.max(sum / L.length, 0.05)));
      const bp = 1 + (b - 1) * 0.3; // позитив мягче: тёмные кадры чуть приподнимаем, светлые не выжигаем
      return {
        b: b.toFixed(2),
        bp: bp.toFixed(2),
      };
    } catch { return null; }
  }

  const tiles = $$('.tile', grid);
  tiles.forEach((t, n) => {
    const img = $('.t-neg', t);
    const aspect = t.classList.contains('size-w') ? 4 / 3 : 2 / 3;
    const done = () => {
      const a = img.naturalWidth && analyse(img, aspect);
      if (a) {
        img.style.setProperty('--b', a.b);
        img.style.setProperty('--bp', a.bp);
      }
      setTimeout(() => t.classList.add('is-loaded'), Math.min(n, 14) * 45);
    };
    img.complete && img.naturalWidth ? done() : img.addEventListener('load', done, { once: true });
    img.addEventListener('error', done, { once: true });
  });

  /* На телефоне нет наведения: цвет проявляется у плитки в центре экрана */
  if (touch && 'IntersectionObserver' in window) {
    const live = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('is-live', e.isIntersecting)), {
      rootMargin: '-42% 0px -42% 0px',
    });
    tiles.forEach((t) => live.observe(t));
  }

  /* ── вид: инверсия, плотность, фильтр ─────── */

  const toolbar = $('#toolbar');
  const invertBtn = $('[data-act="invert"]', toolbar);
  const filterBtn = $('[data-act="filter"]', toolbar);
  const filters = $('#filters');
  const root = document.documentElement;
  const themeColor = $('meta[name="theme-color"]');

  /* переворот сайта: на время смены темы включаем плавные переходы цвета */
  let flipTimer;
  function flip() {
    root.classList.add('is-flipping');
    clearTimeout(flipTimer);
    flipTimer = setTimeout(() => root.classList.remove('is-flipping'), 700);
  }

  const LEVELS = { phone: [1, 2, 3, 4], tablet: [2, 3, 5, 7], desk: [3, 5, 7, 9] };
  const DEFAULT_LEVEL = { phone: 2, tablet: 3, desk: 3 };
  const device = () => (innerWidth <= 760 ? 'phone' : innerWidth <= 1100 ? 'tablet' : 'desk');

  const state = {
    invert: store.get('invert') === '1',
    level: parseInt(store.get('level'), 10) || 0, // 0 = по умолчанию для устройства
    cats: [], // выбранные категории (одна из панели фильтра или несколько из подборки)
    year: null,
  };

  function applyView() {
    const d = device();
    const level = state.level || DEFAULT_LEVEL[d];
    const cols = LEVELS[d][level - 1];
    grid.style.setProperty('--cols', cols);
    grid.dataset.cols = cols;
    $$('[data-density]', toolbar).forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.density === level)));

    root.classList.toggle('is-inverted', state.invert);
    invertBtn.setAttribute('aria-pressed', String(state.invert));
    themeColor && themeColor.setAttribute('content', state.invert ? '#ffffff' : '#000000');

    tiles.forEach((t) => {
      const out = (state.cats.length && !state.cats.includes(t.dataset.cat)) || (state.year && t.dataset.year !== state.year);
      t.classList.toggle('is-out', !!out);
      $('a', t).tabIndex = out ? -1 : 0;
    });
    $$('button', filters).forEach((b) => {
      const on = b.dataset.cat ? state.cats.includes(b.dataset.cat) : b.dataset.year ? b.dataset.year === state.year : !state.cats.length && !state.year;
      b.setAttribute('aria-pressed', String(on));
    });
  }

  const count = (key) => WORKS.reduce((m, w) => m.set(w[key] || '—', (m.get(w[key] || '—') || 0) + 1), new Map());
  const CAT_ORDER = ['Коллекция', 'Вещь', 'Аксессуар', 'Обувь', 'Костюм', 'Образ', 'Эскиз', 'Визуал', 'Процесс', 'Деталь'];
  const rank = (c) => (CAT_ORDER.includes(c) ? CAT_ORDER.indexOf(c) : CAT_ORDER.length);
  const cats = [...count('category')].sort((a, b) => rank(a[0]) - rank(b[0]));
  const yrs = [...count('year')].sort((a, b) => (a[0] === '—') - (b[0] === '—') || b[0].localeCompare(a[0]));

  filters.innerHTML = `
    <div>
      <h3>Тип</h3>
      <button type="button" data-all>Все работы <span class="f-n">${WORKS.length}</span></button>
      ${cats.map(([c, n]) => `<button type="button" data-cat="${esc(c)}">${esc(c)} <span class="f-n">${n}</span></button>`).join('')}
    </div>
    <div>
      <h3>Год</h3>
      ${yrs.map(([y, n]) => `<button type="button" data-year="${esc(y)}">${y === '—' ? 'Год не указан' : esc(y)} <span class="f-n">${n}</span></button>`).join('')}
    </div>`;

  filters.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if ('all' in b.dataset) { state.cats = []; state.year = null; }
    if (b.dataset.cat) state.cats = state.cats.length === 1 && state.cats[0] === b.dataset.cat ? [] : [b.dataset.cat];
    if (b.dataset.year) state.year = state.year === b.dataset.year ? null : b.dataset.year;
    applyView();
    const first = tiles.find((t) => !t.classList.contains('is-out'));
    if (first && first.getBoundingClientRect().top > innerHeight) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });

  function toggleFilters(open = filters.hidden) {
    filters.hidden = !open;
    filterBtn.setAttribute('aria-expanded', String(open));
  }

  toolbar.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.density) {
      state.level = +b.dataset.density;
      store.set('level', state.level);
    } else if (b.dataset.act === 'invert') {
      state.invert = !state.invert;
      store.set('invert', state.invert ? '1' : '0');
      flip();
    } else if (b.dataset.act === 'filter') {
      toggleFilters();
    } else if (b.dataset.act === 'reset') {
      if (state.invert) flip();
      Object.assign(state, { invert: false, level: 0, cats: [], year: null });
      store.set('invert', '0');
      store.set('level', '0');
      toggleFilters(false);
    }
    applyView();
  });

  document.addEventListener('click', (e) => {
    if (!filters.hidden && !e.target.closest('#filters, #toolbar')) toggleFilters(false);
  });

  /* панель видна, пока на экране архив */
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => {
      toolbar.classList.toggle('is-hidden', !e.isIntersecting);
      if (!e.isIntersecting) toggleFilters(false);
    }, { rootMargin: '-35% 0px -35% 0px' }).observe($('#archive'));
  }

  /* ── проекты ───────────────────────────── */

  $('#project-list').innerHTML = PROJECTS.map((p) => `
    <article class="project" id="p-${p.id}">
      <div class="project-head">
        <h3 class="project-title${p.title.length > 6 ? ' is-long' : ''}">${esc(p.title)}</h3>
        <p class="project-meta">${brand(p.meta)}</p>
        <p class="project-text">${esc(p.text)}</p>
        <p class="project-links"><a href="#/${p.id}/0">Смотреть проект целиком ${arrow()}</a></p>
      </div>
      <ol class="project-stages">
        ${p.stages.map((st) => {
          const cover = st.images[0];
          const cap = `<span class="ps-cap"><span>${pad(st.n)} ${esc(st.title)}${cover ? ` <span class="ps-n">[${st.images.length}]</span>` : ''}</span><span class="ps-text">${esc(st.text)}</span></span>`;
          return cover
            ? `<li><a href="#/${p.id}/${st.start}"><figure><img src="${small(cover.src)}" alt="${esc(st.title)}" loading="lazy"></figure>${cap}</a></li>`
            : `<li class="is-soon"><figure><span>${esc(st.soon || 'Скоро')}</span></figure>${cap}</li>`;
        }).join('')}
      </ol>
    </article>`).join('');

  /* ── подход: направления ────────────────── */

  const thumb = (src) => src + '-t.webp';

  const editList = $('#edit-list');
  const tgLink = (label) =>
    `<a class="edit-cta" href="${esc(SITE.telegram)}" target="_blank" rel="noopener">${label} ${arrow(-45)}</a>`;

  editList.innerHTML = DIRS.map((d) => {
    const head = d.images.length
      ? `<h3 class="edit-title"><a href="#/${d.id}/0">${esc(d.title)} <span class="edit-n" aria-hidden="true">[${d.works.length}]</span></a></h3>`
      : `<h3 class="edit-title"><span class="edit-name">${esc(d.title)}</span></h3>`;
    const links = d.images.length
      ? `<a href="#/${d.id}/0">Смотреть все ${arrow()}</a>${tgLink('Обсудить заказ')}`
      : tgLink('Обсудить заказ');
    const rail = d.images.length
      ? `<div class="edit-rail">
          <div class="edit-strip" role="group" aria-label="${esc(d.title)}">
            ${d.images
              .map((im, k) => `<a class="edit-thumb" href="#/${d.id}/${k}" draggable="false" aria-label="${esc(titleOf(im.from.w))}, кадр ${im.from.i + 1}"><img src="${thumb(im.src)}" alt="" loading="lazy" decoding="async" draggable="false"></a>`)
              .join('')}
          </div>
          <button type="button" class="edit-btn" data-dir="-1" aria-label="Назад" hidden>${arrow(180)}</button>
          <button type="button" class="edit-btn" data-dir="1" aria-label="Вперёд">${arrow(0)}</button>
        </div>`
      : `<div class="edit-rail"><p class="edit-soon">${esc(d.soon || 'Скоро')}</p></div>`;
    return `
      <li class="edit" id="d-${d.id}">
        <div class="edit-head">
          ${head}
          <p class="edit-text">${esc(d.text)}</p>
          <p class="edit-links">${links}</p>
        </div>
        ${rail}
      </li>`;
  }).join('');

  /* негатив миниатюры подбирается по яркости кадра, как у плиток */
  $$('.edit-thumb img', editList).forEach((img) => {
    const done = () => {
      const a = img.naturalWidth && analyse(img, 4 / 5);
      if (a) {
        img.style.setProperty('--b', a.b);
        img.style.setProperty('--bp', a.bp);
      }
      img.classList.add('is-loaded');
    };
    img.complete && img.naturalWidth ? done() : img.addEventListener('load', done, { once: true });
    img.addEventListener('error', () => img.classList.add('is-loaded'), { once: true });
  });

  /* лента листается колесом/тачпадом/пальцем; мышью — перетаскиванием и кнопками по краям */
  $$('.edit-strip', editList).forEach((strip) => {
    const rail = strip.parentElement;
    const [prev, next] = $$('.edit-btn', rail);
    const sync = () => {
      prev.hidden = strip.scrollLeft < 4;
      next.hidden = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4;
    };
    strip.addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync);
    sync();

    rail.addEventListener('click', (e) => {
      const b = e.target.closest('.edit-btn');
      if (b) strip.scrollBy({ left: +b.dataset.dir * strip.clientWidth * 0.8, behavior: 'smooth' });
    });

    let justDragged = false;
    strip.addEventListener('click', (e) => {
      if (!justDragged) return;
      e.preventDefault();
      e.stopPropagation();
    }, true);

    strip.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const x0 = e.clientX, left0 = strip.scrollLeft;
      let moved = false;
      const move = (ev) => {
        const dx = ev.clientX - x0;
        if (!moved && Math.abs(dx) > 5) { moved = true; strip.classList.add('is-drag'); }
        if (moved) strip.scrollLeft = left0 - dx;
      };
      const up = () => {
        removeEventListener('pointermove', move);
        removeEventListener('pointerup', up);
        removeEventListener('pointercancel', up);
        strip.classList.remove('is-drag');
        if (moved) { justDragged = true; setTimeout(() => (justDragged = false), 0); }
      };
      addEventListener('pointermove', move);
      addEventListener('pointerup', up);
      addEventListener('pointercancel', up);
    });
  });

  /* ── о Полине ───────────────────────────── */

  $('#about-text').innerHTML = SITE.about
    .map((p) => `<p>${esc(p).replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`)
    .join('');

  const shot = (ref) => {
    const w = byId.get(ref.work);
    return w && { w, img: w.images[ref.i] || w.images[0], href: `#/${w.id}/${ref.i || 0}` };
  };

  /* ── контакты ───────────────────────────── */

  const [main, ...rest] = SITE.contacts;
  $('#contact-body').innerHTML = `
    <a class="contact-main" href="${esc(main.href)}" target="_blank" rel="noopener">${esc(main.text)}${arrow(-45)}</a>
    <dl class="contact-rows">
      ${SITE.contacts.map((c) => `<div><dt>${esc(c.label)}</dt><dd><a href="${esc(c.href)}" target="_blank" rel="noopener">${esc(c.text)}</a></dd></div>`).join('')}
      <div><dt>Проект</dt><dd>${brand(SITE.project)}</dd></div>
    </dl>`;
  void rest;

  /* ── просмотр работы ────────────────────── */

  const viewer = $('#viewer');
  const stage = $('#v-stage');
  const thumbs = $('#v-thumbs');
  let current = null; // { w, i }
  let openedFromPage = false;
  let returnFocus = null;
  let slideObs = null;

  const field = (label, value) =>
    `<div><dt>${label}</dt>${value ? `<dd>${value}</dd>` : '<dd class="is-empty">— будет добавлено</dd>'}</div>`;

  function render(w) {
    $('#v-cat').textContent = `[${w.category}] № ${pad(w.n)}`;
    $('#v-title').textContent = titleOf(w);
    $('#v-fields').innerHTML = w.project ? [
      field('Проект / коллекция', brand(w.meta)),
      field('О проекте', rich(w.description)),
      field('Этапы', `<ul>${w.stages.map((st) => st.images.length ? `<li><a href="#/${w.id}/${st.start}">${pad(st.n)} ${esc(st.title)}</a></li>` : `<li>${pad(st.n)} ${esc(st.title)} — ${esc((st.soon || 'скоро').toLowerCase())}</li>`).join('')}</ul>`),
    ].join('') : w.dir ? [
      field('Направление', rich(w.description)),
      field('Работы', `<ul>${w.works.map((x) => `<li><a href="#/${x.id}/0">${esc(titleOf(x))}</a></li>`).join('')}</ul>`),
    ].join('') : [
      field('Год', esc(w.year)),
      w.project || w.collection ? field('Проект / коллекция', brand([w.project, w.collection].filter(Boolean).join(' — '))) : field('Проект / коллекция', ''),
      field('Материалы и техники', w.details.length ? `<ul>${w.details.map((d) => `<li>${rich(d)}</li>`).join('')}</ul>` : ''),
      field('Описание', rich(w.description)),
    ].join('');

    stage.innerHTML = w.images
      .map((im, k) => `<figure class="v-slide" data-k="${k}">
          <img src="${large(im.src)}" width="${im.w}" height="${im.h}" alt="${esc(titleOf(w))}, кадр ${k + 1}${im.caption ? ': ' + esc(im.caption) : ''}" loading="${k < 2 ? 'eager' : 'lazy'}" decoding="async">
        </figure>`)
      .join('');
    $$('img', stage).forEach((img) => {
      const on = () => img.classList.add('is-loaded');
      img.complete && img.naturalWidth ? on() : img.addEventListener('load', on, { once: true });
    });

    thumbs.innerHTML = w.images
      .map((im, k) => `<button type="button" data-k="${k}" aria-label="Кадр ${k + 1}"><img src="${small(im.src)}" alt="" loading="lazy"></button>`)
      .join('');

    slideObs && slideObs.disconnect();
    slideObs = new IntersectionObserver((es) => {
      es.forEach((e) => e.isIntersecting && setSlide(+e.target.dataset.k, false));
    }, { root: stage, threshold: 0.6 });
    $$('.v-slide', stage).forEach((s) => slideObs.observe(s));
  }

  function setSlide(k, scroll = true) {
    const w = current.w;
    k = Math.max(0, Math.min(w.images.length - 1, k));
    current.i = k;
    const { caption: cap, from, stage: sn } = w.images[k];
    const st = w.project ? `<span class="v-stage-name">Этап ${pad(sn + 1)} · ${esc(w.stages[sn].title)}</span>` : '';
    const src = from ? `<a class="v-from" href="#/${from.w.id}/${from.i}">${esc(titleOf(from.w))} ${arrow()}</a>` : '';
    $('#v-counter').innerHTML = `Кадр ${pad(k + 1)} / ${pad(w.images.length)}${st}${src}${cap ? `<span class="v-cap">${rich(cap)}</span>` : ''}`;
    $$('button', thumbs).forEach((b) => b.setAttribute('aria-current', String(+b.dataset.k === k)));
    const tb = thumbs.children[k];
    tb && tb.scrollIntoView({ block: 'nearest' });
    if (scroll) stage.children[k].scrollIntoView({ block: 'center', inline: 'center' });
    history.replaceState(history.state, '', `#/${w.id}/${k}`);
  }

  function open(id, k = 0) {
    const w = byId.get(id);
    if (!w) return close(true);
    const same = current && current.w === w;
    if (!same) {
      if (!current) returnFocus = document.activeElement;
      current = { w, i: k };
      render(w);
    }
    if (viewer.hidden) {
      viewer.hidden = false;
      document.body.classList.add('is-locked');
      requestAnimationFrame(() => viewer.classList.add('is-open'));
    }
    requestAnimationFrame(() => {
      stage.children[k] && stage.children[k].scrollIntoView({ block: 'center', inline: 'center' });
      setSlide(k, false);
      if (!same) $('#v-close').focus({ preventScroll: true });
    });
    document.title = `${titleOf(w)} — ${SITE.name}`;
  }

  function close(silent) {
    if (!current) return;
    current = null;
    viewer.classList.remove('is-open');
    document.body.classList.remove('is-locked');
    setTimeout(() => { if (!current) { viewer.hidden = true; stage.innerHTML = ''; thumbs.innerHTML = ''; } }, 350);
    document.title = `${SITE.name} — архив`;
    if (!silent) {
      if (openedFromPage) history.back();
      else history.replaceState(null, '', location.pathname + location.search);
    }
    openedFromPage = false;
    returnFocus && returnFocus.focus && returnFocus.focus({ preventScroll: true });
  }

  function route() {
    const m = location.hash.match(/^#\/([\w-]+)(?:\/(\d+))?$/);
    if (m) open(m[1], parseInt(m[2] || '0', 10));
    else close(true);
  }

  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (a && !viewer.contains(a)) openedFromPage = true;
  });

  window.addEventListener('hashchange', route);
  $('#v-close').addEventListener('click', () => close());
  thumbs.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    b && setSlide(+b.dataset.k);
  });

  /* «Предыдущая / Следующая» листают работы, на странице направления — направления,
     в проекте — этапы */
  const step = (d) => {
    if (current.w.project) {
      const full = current.w.stages.filter((st) => st.images.length);
      const now = full.findIndex((st) => current.i < st.start + st.images.length);
      setSlide(full[(now + d + full.length) % full.length].start);
      return;
    }
    const list = current.w.dir ? DIRS.filter((x) => x.images.length) : WORKS;
    const n = (list.indexOf(current.w) + d + list.length) % list.length;
    const w = list[n];
    current = { w, i: 0 };
    render(w);
    stage.scrollTop = stage.scrollLeft = 0;
    setSlide(0, false);
    document.title = `${titleOf(w)} — ${SITE.name}`;
  };
  $('#v-prev').addEventListener('click', () => step(-1));
  $('#v-next').addEventListener('click', () => step(1));

  document.addEventListener('keydown', (e) => {
    if (!current) {
      if (e.key === 'Escape') toggleFilters(false);
      return;
    }
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowDown' || e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); setSlide(current.i + 1); }
    else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setSlide(current.i - 1); }
    else if (e.key === 'Tab') {
      const f = $$('a[href], button', viewer).filter((el) => el.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  });

  /* ── старт ─────────────────────────────── */

  let rz;
  addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(applyView);
  });

  applyView();
  route();
})();
