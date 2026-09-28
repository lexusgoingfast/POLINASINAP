/* Чтение и запись data/works.js — общий модуль для админки (браузер) и node.
   Файл перезаписывается целиком, но в привычном виде: шапка-комментарий сохраняется,
   комментарии над ключами SITE тоже, строки в одинарных кавычках, короткое — в одну строку. */
(function (root) {
  'use strict';

  const WIDTH = 100;
  const IDENT = /^[A-Za-z_$][\w$]*$/;

  function parse(text) {
    const { SITE, WORKS } = new Function(text + '\n;return { SITE, WORKS };')();
    const head = text.slice(0, text.indexOf('const SITE'));
    // комментарии над ключами SITE: строки «  // …» прямо перед «  key:»
    const notes = {};
    const lines = text.slice(text.indexOf('const SITE')).split('\n');
    let buf = [];
    for (const line of lines) {
      if (/^ {2}\/\//.test(line)) { buf.push(line.trim()); continue; }
      const m = line.match(/^ {2}([A-Za-z_$][\w$]*):/);
      if (m && buf.length) notes[m[1]] = buf;
      if (line.trim()) buf = [];
    }
    return { SITE, WORKS, head, notes };
  }

  const str = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n') + "'";
  const key = (k) => (IDENT.test(k) ? k : str(k));

  function inline(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'string') return str(v);
    if (typeof v !== 'object') return String(v);
    if (Array.isArray(v)) return v.length ? '[' + v.map(inline).join(', ') + ']' : '[]';
    const ks = Object.keys(v).filter((k) => v[k] !== undefined);
    return ks.length ? '{ ' + ks.map((k) => key(k) + ': ' + inline(v[k])).join(', ') + ' }' : '{}';
  }

  /* длинная строка — кусками через « +» на следующих строках, как пишут руками */
  function longString(s, pad) {
    const inner = pad + '  ';
    const max = WIDTH - inner.length - 4;
    const parts = [];
    let cur = '';
    for (const word of String(s).split(/(?<= )/)) {
      if (cur && (cur + word).length > max) { parts.push(cur); cur = ''; }
      cur += word;
    }
    parts.push(cur);
    return '\n' + parts.map((p, i) => inner + str(p) + (i < parts.length - 1 ? ' +' : '')).join('\n');
  }

  function value(v, pad, room) {
    const one = inline(v);
    if (typeof v === 'string' && one.length > room && v.length > 40) return longString(v, pad);
    if (typeof v !== 'object' || v === null || one.length <= room) return one;
    const inner = pad + '  ';
    if (Array.isArray(v)) {
      return '[\n' + v.map((x) => inner + value(x, inner, WIDTH - inner.length - 1) + ',').join('\n') + '\n' + pad + ']';
    }
    const ks = Object.keys(v).filter((k) => v[k] !== undefined);
    return '{\n' + ks.map((k) => {
      const lead = inner + key(k) + ': ';
      return lead + value(v[k], inner, WIDTH - lead.length - 1) + ',';
    }).join('\n') + '\n' + pad + '}';
  }

  function stringify({ SITE, WORKS, head, notes = {} }) {
    // пустая строка — перед ключом с комментарием и после многострочного значения
    let prevMulti = false;
    const site = Object.keys(SITE).map((k, n) => {
      const lead = '  ' + key(k) + ': ';
      const note = (notes[k] || []).map((l) => '  ' + l + '\n').join('');
      const body = lead + value(SITE[k], '  ', WIDTH - lead.length - 1) + ',';
      const gap = n && (note || prevMulti) ? '\n' : '';
      prevMulti = body.includes('\n');
      return gap + note + body;
    }).join('\n');
    const out = head + 'const SITE = {\n' + site + '\n};\n\nconst WORKS = ' + value(WORKS, '', 0) + ';\n';
    return out.replace(/ +\n/g, '\n');
  }

  const api = { parse, stringify };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.WorksFile = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
