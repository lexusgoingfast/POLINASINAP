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

  /* ── тексты ─────────────────────────────── */

  $('#intro').innerHTML = brand(SITE.intro);
  $('#nav-count').textContent = `[${WORKS.length}]`;
  $('#nav-tg').href = SITE.telegram;
  $('#v-cta').href = SITE.telegram;
  $('#hero-name').textContent = `[${SITE.name}]`;
  $('#hero-project').innerHTML = `[Дизайнер одежды, автор проекта ${brand(SITE.project)}]`;

  const years = WORKS.map((w) => parseInt(w.year, 10)).filter(Boolean);
  if (years.length) {
    const a = Math.min(...years), b = Math.max(...years);
    $('#hero-years').textContent = `[Архив ${a === b ? a : a + '—' + b}]`;
  }
  $('#foot-copy').innerHTML = `© ${new Date().getFullYear()} ${esc(SITE.name)} — ${brand(SITE.project)}`;

  /* ── знак на первом экране: по буквам, во всю ширину ── */

  const wm = $('#wordmark');
  const mark = SITE.wordmark || SITE.name;
  wm.setAttribute('aria-label', mark);
  wm.innerHTML = [...mark]
    .map((ch, i) => `<span class="l" aria-hidden="true" style="--i:${i}"><span>${ch === ' ' ? '&nbsp;' : esc(ch)}</span></span>`)
    .join('');

  /* Подгоняем по реальным границам точек, а не по ширине букв:
     у Punkbabe полутоновые ореолы выходят за пределы знаков. */
  const measure = document.createElement('canvas').getContext('2d');

  function fitWordmark() {
    const box = wm.parentElement;
    const cs = getComputedStyle(box);
    const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    measure.font = `100px ${getComputedStyle(wm).fontFamily}`;
    const m = measure.measureText(mark);
    const left = m.actualBoundingBoxLeft || 0;
    const ink = left + (m.actualBoundingBoxRight || m.width);
    const size = Math.floor(((100 * avail) / ink) * 0.995);
    wm.style.fontSize = size + 'px';
    wm.style.marginLeft = ((left / 100) * size).toFixed(1) + 'px';
  }

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
          <span class="t-num">${k === 0 ? `№ ${pad(w.n)}` : `${pad(g.i + 1)}/${pad(w.images.length)}`}</span>
        </a>
      </li>`;
  }).join('');

  /* Разбор кадра на маленьком холсте:
     1) средняя яркость → сила засветки перед инверсией (как в референсе:
        светлые фото уходят в глубокий чёрный);
     2) яркость углов, где стоят подписи → белый или чёрный текст,
        отдельно для негатива, для позитива (инверсия сайта) и для цветного оригинала. */
  const probe = document.createElement('canvas');
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  const CONTRAST = 1.14; // то же значение, что в фильтре .t-neg
  const CONTRAST_POS = 1.06; // то же, что в фильтре .t-neg при .is-inverted

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
      const neg = (v) => (1 - Math.min(1, v * b) - 0.5) * CONTRAST + 0.5;
      const pos = (v) => (Math.min(1, v * bp) - 0.5) * CONTRAST_POS + 0.5;
      const region = (x0, y0, x1, y1, f) => {
        let s = 0, n = 0;
        for (let y = Math.floor(y0 * H); y < Math.ceil(y1 * H); y++)
          for (let x = Math.floor(x0 * W); x < Math.ceil(x1 * W); x++) { s += f(L[y * W + x]); n++; }
        return s / n;
      };
      const id = (v) => v;
      return {
        b: b.toFixed(2),
        bp: bp.toFixed(2),
        cap: region(0, 0, 0.8, 0.2, neg) > 0.5,
        capP: region(0, 0, 0.8, 0.2, pos) > 0.5,
        capOn: region(0, 0, 0.8, 0.2, id) > 0.55,
        num: region(0.6, 0.88, 1, 1, neg) > 0.5,
        numP: region(0.6, 0.88, 1, 1, pos) > 0.5,
        numOn: region(0.6, 0.88, 1, 1, id) > 0.55,
      };
    } catch { return null; }
  }

  const ink = (light, on) => (light ? (on ? '#000' : 'rgba(0,0,0,.78)') : on ? '#fff' : 'rgba(255,255,255,.8)');

  const tiles = $$('.tile', grid);
  tiles.forEach((t, n) => {
    const img = $('.t-neg', t);
    const aspect = t.classList.contains('size-w') ? 4 / 3 : 2 / 3;
    const done = () => {
      const a = img.naturalWidth && analyse(img, aspect);
      if (a) {
        img.style.setProperty('--b', a.b);
        img.style.setProperty('--bp', a.bp);
        t.style.setProperty('--cap', ink(a.cap));
        t.style.setProperty('--cap-p', ink(a.capP));
        t.style.setProperty('--cap-on', ink(a.capOn, true));
        t.style.setProperty('--num', ink(a.num));
        t.style.setProperty('--num-p', ink(a.numP));
        t.style.setProperty('--num-on', ink(a.numOn, true));
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

  /* ── подборки ───────────────────────────── */

  const thumb = (src) => src + '-t.webp';

  /* Лента строки: сначала обложки всех работ подборки, потом вторые кадры и так далее —
     так подборка из одной работы тоже получает полную ленту, а большая не сводится к первым работам. */
  function reel(list, cap = 24) {
    const out = [];
    for (let k = 0; out.length < cap; k++) {
      let any = false;
      for (const w of list) {
        if (out.length >= cap) break;
        if (w.images[k]) { out.push({ w, i: k }); any = true; }
      }
      if (!any) break;
    }
    return out;
  }

  const editList = $('#edit-list');
  const editRows = (SITE.edits || [])
    .map((e) => {
      const list = WORKS.filter((w) => e.cats.includes(w.category));
      return { ...e, list, items: reel(list) };
    })
    .filter((e) => e.items.length);

  editList.innerHTML =
    editRows
      .map((e, r) => `
      <li class="edit">
        <h3 class="edit-title"><a href="#archive" data-edit="${r}">${esc(e.title)} <span class="edit-n" aria-hidden="true">[${e.list.length}]</span></a></h3>
        <div class="edit-rail">
          <div class="edit-strip" role="group" aria-label="${esc(e.title)}">
            ${e.items
              .map(({ w, i }) => `<a class="edit-thumb" href="#/${w.id}/${i}" draggable="false" aria-label="${esc(titleOf(w))}, кадр ${i + 1}"><img src="${thumb(w.images[i].src)}" alt="" loading="lazy" decoding="async" draggable="false"></a>`)
              .join('')}
          </div>
          <button type="button" class="edit-btn" data-dir="-1" aria-label="Назад" hidden>${arrow(180)}</button>
          <button type="button" class="edit-btn" data-dir="1" aria-label="Вперёд">${arrow(0)}</button>
        </div>
      </li>`)
      .join('') +
    `<li class="edit edit--all"><h3 class="edit-title"><a href="#archive" class="hero-down" data-edit="all">${esc(SITE.editsAll || 'Весь архив')} ${arrow(-90)}</a></h3></li>`;

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
  $$('.edit-rail', editList).forEach((rail) => {
    const strip = $('.edit-strip', rail);
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

  /* название подборки → показать её в архиве; «Весь архив» → снять фильтры и вернуться к сетке */
  editList.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-edit]');
    if (!a) return;
    e.preventDefault();
    const row = editRows[a.dataset.edit];
    state.cats = row ? row.cats : [];
    state.year = null;
    toggleFilters(false);
    applyView();
    const first = row && tiles.find((t) => !t.classList.contains('is-out'));
    (first || $('#archive')).scrollIntoView({ behavior: 'smooth', block: first ? 'center' : 'start' });
  });

  /* ── о Полине ───────────────────────────── */

  $('#about-text').innerHTML = SITE.about
    .map((p) => `<p>${esc(p).replace(/\*(.+?)\*/g, '<em>$1</em>')}</p>`)
    .join('');

  const shot = (ref) => {
    const w = byId.get(ref.work);
    return w && { w, img: w.images[ref.i] || w.images[0], href: `#/${w.id}/${ref.i || 0}` };
  };

  const preview = $('#approach-preview');
  $('#approach-list').innerHTML = SITE.approach
    .map((a, n) => {
      const s = shot(a);
      return `<li><a href="${s ? s.href : '#archive'}" data-src="${s ? small(s.img.src) : ''}">
        <span class="a-n">${pad(n + 1)}</span>
        <span>${esc(a.text)}</span>
        ${s ? `<span class="a-work">${esc(titleOf(s.w))} ${arrow()}</span><img class="a-thumb" src="${small(s.img.src)}" alt="" loading="lazy">` : ''}
      </a></li>`;
    })
    .join('');

  $$('#approach-list a').forEach((a) => {
    const show = () => {
      if (!a.dataset.src) return;
      $('img', preview).src = a.dataset.src;
      preview.style.transform = `translateY(${a.closest('li').offsetTop}px)`;
      preview.classList.add('is-on');
    };
    a.addEventListener('mouseenter', show);
    a.addEventListener('focus', show);
  });
  $('#approach-list').addEventListener('mouseleave', () => preview.classList.remove('is-on'));

  $('#method-list').innerHTML = SITE.method
    .map((m, n) => {
      const s = shot(m);
      if (!s) return '';
      return `<li><a href="${s.href}">
        <figure><img src="${small(s.img.src)}" alt="${esc(m.label)}: ${esc(titleOf(s.w))}" loading="lazy"></figure>
        <span class="m-cap"><span>${pad(n + 1)} ${esc(m.label)}</span><span>${esc(titleOf(s.w))}</span></span>
      </a></li>`;
    })
    .join('');

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
    $('#v-fields').innerHTML = [
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
    const cap = w.images[k].caption;
    $('#v-counter').innerHTML = `Кадр ${pad(k + 1)} / ${pad(w.images.length)}${cap ? `<span class="v-cap">${rich(cap)}</span>` : ''}`;
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

  const step = (d) => {
    const n = (current.w.n - 1 + d + WORKS.length) % WORKS.length;
    const w = WORKS[n];
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

  /* ── видео-циклы из TouchDesigner ────────── */

  const still = matchMedia('(prefers-reduced-motion: reduce)'); // без движения — только первый кадр

  /* Цикл играет, только пока виден. Возвращает sync — его нужно вызвать после смены источника. */
  function keepLooping(video) {
    let inView = true;
    const sync = () => {
      if (still.matches || document.hidden || !inView) video.pause();
      else video.play().catch(() => {}); // экономия энергии может не дать автозапуск — тогда остаётся постер
    };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(([e]) => { inView = e.isIntersecting; sync(); }).observe(video);
    }
    document.addEventListener('visibilitychange', sync);
    still.addEventListener('change', sync);
    addEventListener('pointerdown', sync, { once: true, passive: true }); // запасной запуск по первому касанию
    sync();
    return sync;
  }

  /* знак на первом экране */
  const hero = $('.hero');
  const heroAnim = $('#hero-anim');
  if (heroAnim) {
    heroAnim.addEventListener('error', () => hero.classList.remove('has-anim'), { once: true }); // нет ролика — текстовый знак
    keepLooping(heroAnim);
  }

  /* подвал: случайный ролик из assets/footer/; подгружается, когда подвал уже близко к экрану */
  const foot = $('#foot-anim');
  const footVideo = $('#foot-video');
  const footLoops = SITE.footerLoops || 0;
  if (foot && footLoops > 0) {
    foot.hidden = false; // место под ролик занято сразу, страница не прыгает

    const work = byId.get(SITE.footerWork);
    const workLink = $('#foot-work');
    if (work) {
      workLink.href = `#/${work.id}/0`;
      workLink.textContent = `[${work.category}] ${titleOf(work)}${work.year ? ', ' + work.year : ''}`;
    } else workLink.remove();

    const reroll = $('#foot-reroll');
    reroll.hidden = footLoops < 2;

    let current = -1;
    const sync = keepLooping(footVideo);
    const show = (k) => {
      current = k;
      const base = `assets/footer/loop-${pad(k + 1)}`;
      footVideo.poster = base + '.webp';
      footVideo.preload = 'auto';
      footVideo.src = base + '.mp4';
      sync();
    };
    const another = () => {
      let k;
      do k = Math.floor(Math.random() * footLoops); while (footLoops > 1 && k === current);
      return k;
    };

    footVideo.addEventListener('error', () => { foot.hidden = true; }); // нет файлов — блока нет
    reroll.addEventListener('click', () => show(another()));
    if ('IntersectionObserver' in window) {
      const near = new IntersectionObserver(([e]) => {
        if (!e.isIntersecting) return;
        near.disconnect();
        show(another());
      }, { rootMargin: '900px 0px' });
      near.observe(foot);
    } else show(another());
  }

  /* ── старт ─────────────────────────────── */

  let rz;
  addEventListener('resize', () => {
    cancelAnimationFrame(rz);
    rz = requestAnimationFrame(() => { fitWordmark(); applyView(); });
  });

  applyView();
  fitWordmark();
  const ready = () => {
    if (document.body.classList.contains('is-ready')) return;
    fitWordmark();
    requestAnimationFrame(() => document.body.classList.add('is-ready'));
    setTimeout(() => wm.classList.add('is-settled'), 1100 + mark.length * 45);
  };
  (document.fonts ? document.fonts.ready : Promise.resolve()).then(ready);
  setTimeout(ready, 1500); // если шрифт не загрузился (офлайн) — показываем имя системным
  route();
})();
