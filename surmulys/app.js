import { startScene } from './scene.js';

const TZ = 'Europe/Vilnius';
const CATS = {
  concert:  { label: 'Концерты',   icon: '🎤', color: '#ff4f8b' },
  theatre:  { label: 'Театр',      icon: '🎭', color: '#b47cff' },
  expo:     { label: 'Выставки',   icon: '🖼️', color: '#35e0d0' },
  festival: { label: 'Фестивали',  icon: '🎪', color: '#ffb547' },
  film:     { label: 'Кино',       icon: '🎬', color: '#5aa8ff' },
  sport:    { label: 'Спорт',      icon: '🏀', color: '#7ee06a' },
  kids:     { label: 'Детям',      icon: '🧸', color: '#ff8a5c' },
  night:    { label: 'Вечеринки',  icon: '🪩', color: '#ff5ce1' },
  talk:     { label: 'Лекции',     icon: '💡', color: '#e8d96a' },
  other:    { label: 'Разное',     icon: '✨', color: '#9a8fc0' },
};
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeUrl = u => (/^https?:\/\//i.test(u || '') ? u : '');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;

const fmtDay = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });
const fmtTime = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const fmtLong = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, day: 'numeric', month: 'short' });
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const dayKey = d => fmtDay.format(d);
const addDays = (key, n) => { const d = new Date(key + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

const state = { all: [], range: 'today', cat: null, q: '', favs: new Set(), onlyFavs: false, meta: null };
try { state.favs = new Set(JSON.parse(localStorage.getItem('surmulys.favs') || '[]')); } catch {}
const saveFavs = () => { try { localStorage.setItem('surmulys.favs', JSON.stringify([...state.favs])); } catch {} };

let scene = null;
try { scene = startScene($('#bg')); } catch (e) { console.warn('3D отключён:', e); }

/* ---------- данные ---------- */
async function load(bust) {
  let data;
  try {
    const r = await fetch('data/events.json' + (bust ? '?t=' + Date.now() : ''), { cache: bust ? 'reload' : 'default' });
    if (!r.ok) throw new Error(r.status);
    data = await r.json();
  } catch (e) {
    $('#updated').textContent = 'Не удалось загрузить данные';
    if (!state.all.length) render();
    return;
  }
  state.meta = data;
  state.all = (data.events || []).map(e => {
    const s = new Date(e.start), en = e.end ? new Date(e.end) : null;
    const k0 = dayKey(s);
    // событие с длинным диапазоном (выставка) показываем во все дни диапазона, но не дольше 60 дней
    let k1 = en && en > s ? dayKey(en) : k0;
    if (k1 > addDays(k0, 60)) k1 = addDays(k0, 60);
    const hasTime = !/T00:00(:00)?([+-]\d\d:\d\d|Z|\.000Z)?$/.test(e.start) || fmtTime.format(s) !== '00:00';
    return { ...e, _s: s, _k0: k0, _k1: k1, _multi: k1 > k0, _time: hasTime ? fmtTime.format(s) : '' };
  });
  render();
  const gen = data.generatedAt ? new Date(data.generatedAt) : null;
  $('#updated').textContent = gen ? `Данные от ${fmtShort.format(gen)}, ${fmtTime.format(gen)}` : 'Данные ещё не собраны';
  const ok = (data.sources || []).filter(s => s.ok && s.count).map(s => s.source);
  $('#sources').textContent = ok.length ? 'Источники: ' + ok.join(' · ') : '';
  maybeDigest();
}

/* ---------- фильтрация ---------- */
function range() {
  const today = dayKey(new Date());
  switch (state.range) {
    case 'today': return [today, today];
    case 'tomorrow': { const t = addDays(today, 1); return [t, t]; }
    case 'week': return [today, addDays(today, 6)];
    default: return [today, '9999-12-31'];
  }
}
function filtered(ignoreCat) {
  const [a, b] = range();
  const q = state.q.trim().toLowerCase();
  return state.all.filter(e => {
    if (e._k1 < a || e._k0 > b) return false;
    if (state.onlyFavs && !state.favs.has(e.id)) return false;
    if (!ignoreCat && state.cat && e.category !== state.cat) return false;
    if (q && !`${e.title} ${e.venue || ''} ${e.description || ''} ${CATS[e.category]?.label || ''}`.toLowerCase().includes(q)) return false;
    return true;
  });
}

/* ---------- отрисовка ---------- */
function renderChips() {
  const base = filtered(true), counts = {};
  base.forEach(e => counts[e.category] = (counts[e.category] || 0) + 1);
  const favBtn = `<button class="chip ${state.onlyFavs ? 'on' : ''}" style="--c:#ff4f8b" data-fav="1">♥ <small>${state.favs.size}</small></button>`;
  const items = Object.entries(CATS).filter(([k]) => counts[k] || state.cat === k).map(([k, c]) =>
    `<button class="chip ${state.cat === k ? 'on' : ''}" style="--c:${c.color}" data-cat="${k}">${c.icon} ${c.label} <small>${counts[k] || 0}</small></button>`);
  $('#chips').innerHTML = favBtn + items.join('');
}

function cardHtml(e, i) {
  const c = CATS[e.category] || CATS.other, img = safeUrl(e.image), url = safeUrl(e.url);
  const when = e._multi ? `до ${fmtShort.format(new Date(e._k1 + 'T12:00:00Z'))}` : (e._time || 'весь день');
  const extra = '';
  return `<article class="card" style="--c:${c.color};--i:${i}" data-id="${esc(e.id)}">
    ${img ? `<div class="bgimg" style="background-image:url('${esc(img)}')"></div>` : ''}
    <div class="shine"></div>
    <div class="top"><div class="time">${esc(when)}${extra}</div><span class="cat">${c.icon} ${c.label}</span></div>
    <div class="body">
      <h3 class="title">${esc(e.title)}</h3>
      <div class="meta">${e.venue ? `<i>📍 ${esc(e.venue)}</i>` : ''}${e.price ? `<i>🎟 ${esc(e.price)}</i>` : ''}<i>${esc(e.source || '')}</i></div>
      ${e.description ? `<p class="desc">${esc(e.description)}</p>` : ''}
      <div class="actions">
        ${url ? `<a class="btn main" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Подробнее</a>` : ''}
        <button class="btn" data-ics="${esc(e.id)}" aria-label="В календарь">📅</button>
        <button class="btn fav ${state.favs.has(e.id) ? 'on' : ''}" data-favid="${esc(e.id)}" aria-label="В избранное">♥</button>
      </div>
    </div></article>`;
}

function render() {
  const list = filtered();
  renderChips();
  const today = dayKey(new Date());
  const [a] = range();
  const countFor = (x, y) => state.all.filter(e => e._k1 >= x && e._k0 <= y).length;
  setCount('#n-today', countFor(today, today));
  setCount('#n-week', countFor(today, addDays(today, 6)));
  setCount('#n-all', countFor(today, '9999-12-31'));
  $('#today-label').textContent = 'Вильнюс · ' + cap(fmtLong.format(new Date()));

  const host = $('#list');
  if (!list.length) {
    host.innerHTML = '';
    showEmpty();
    return;
  }
  $('#empty').hidden = true;

  // группировка по дням (многодневные — в первый видимый день)
  const groups = new Map();
  list.forEach(e => {
    const k = e._k0 < a ? a : e._k0;
    (groups.get(k) || groups.set(k, []).get(k)).push(e);
  });
  const keys = [...groups.keys()].sort();
  let i = 0;
  const showDays = state.range === 'week' || state.range === 'all';
  host.innerHTML = keys.map(k => {
    const d = new Date(k + 'T12:00:00Z');
    const rel = k === today ? 'Сегодня' : k === addDays(today, 1) ? 'Завтра' : '';
    const head = showDays ? `<div class="day"><b>${rel || new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', weekday: 'long' }).format(d)}</b>${new Intl.DateTimeFormat('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'long' }).format(d)}</div>` : '';
    const items = groups.get(k).sort((x, y) => (x._time || '').localeCompare(y._time || '') || x._s - y._s);
    return head + `<div class="grid">${items.map(e => cardHtml(e, Math.min(i++, 14))).join('')}</div>`;
  }).join('');
  observeCards();
}

function showEmpty() {
  const e = $('#empty'); e.hidden = false;
  const noData = !state.all.length;
  $('#empty-title').textContent = noData ? 'Данные подтягиваются' : state.onlyFavs ? 'Избранное пусто' : 'Ничего не найдено';
  $('#empty-text').textContent = noData
    ? 'Список обновляется автоматически раз в несколько часов. Загляните чуть позже — или нажмите «Обновить».'
    : state.onlyFavs ? 'Нажмите ♥ на карточке, чтобы сохранить событие.'
    : state.range === 'today' ? 'На сегодня ничего не нашлось. Загляните в «Завтра» или «7 дней».' : 'Попробуйте другой фильтр или поиск.';
}

function setCount(sel, n) {
  const el = $(sel), from = +el.dataset.count || 0;
  if (from === n && el.textContent) return;
  el.dataset.count = n;
  if (reduced) { el.textContent = n; return; }
  const t0 = performance.now();
  (function step(t) {
    const p = Math.min(1, (t - t0) / 900), v = Math.round(from + (n - from) * (1 - Math.pow(1 - p, 3)));
    el.textContent = v; if (p < 1) requestAnimationFrame(step);
  })(t0);
}

/* ---------- анимация появления + 3D-наклон ---------- */
const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => {
  if (!en.isIntersecting) return;
  const c = en.target; io.unobserve(c);
  c.classList.add('in');
  c.addEventListener('animationend', () => { c.classList.remove('in'); c.classList.add('done'); }, { once: true });
}), { rootMargin: '0px 0px -6% 0px' }) : null;
function observeCards() {
  document.querySelectorAll('.card').forEach(c => { io ? io.observe(c) : c.classList.add('done'); });
}
if (fine && !reduced) {
  document.addEventListener('pointermove', ev => {
    const c = ev.target.closest?.('.card.done'); if (!c) return;
    const r = c.getBoundingClientRect(), x = (ev.clientX - r.left) / r.width, y = (ev.clientY - r.top) / r.height;
    c.classList.add('hot');
    c.style.setProperty('--ry', ((x - 0.5) * 12).toFixed(2) + 'deg');
    c.style.setProperty('--rx', ((0.5 - y) * 10).toFixed(2) + 'deg');
    c.style.setProperty('--mx', (x * 100) + '%'); c.style.setProperty('--my', (y * 100) + '%');
  });
  document.addEventListener('pointerout', ev => {
    const c = ev.target.closest?.('.card'); if (!c || c.contains(ev.relatedTarget)) return;
    c.classList.remove('hot'); c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg');
  });
}

/* ---------- события интерфейса ---------- */
function movePill() {
  const seg = $('#range'), on = seg.querySelector('.on');
  let pill = seg.querySelector('.pill');
  if (!pill) { pill = document.createElement('i'); pill.className = 'pill'; seg.prepend(pill); }
  pill.style.width = on.offsetWidth + 'px';
  pill.style.transform = `translateX(${on.offsetLeft - 4}px)`;
}
function setAccent() {
  const hex = state.cat ? CATS[state.cat].color : '#ff4f8b';
  document.documentElement.style.setProperty('--accent', hex);
  scene?.setColor(hex); scene?.pulse();
}
$('#range').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  state.range = b.dataset.range;
  document.querySelectorAll('#range button').forEach(x => x.classList.toggle('on', x === b));
  movePill(); scene?.pulse(); render();
});
$('#chips').addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.fav) state.onlyFavs = !state.onlyFavs;
  else state.cat = state.cat === b.dataset.cat ? null : b.dataset.cat;
  setAccent(); render();
});
let qt; $('#q').addEventListener('input', e => { clearTimeout(qt); qt = setTimeout(() => { state.q = e.target.value; render(); }, 150); });
$('#list').addEventListener('click', e => {
  const fav = e.target.closest('[data-favid]');
  if (fav) {
    const id = fav.dataset.favid;
    state.favs.has(id) ? state.favs.delete(id) : state.favs.add(id);
    saveFavs(); fav.classList.toggle('on', state.favs.has(id)); renderChips(); navigator.vibrate?.(12); return;
  }
  const ics = e.target.closest('[data-ics]');
  if (ics) { downloadIcs(state.all.find(x => x.id === ics.dataset.ics)); return; }
  if (e.target.closest('a')) return;
  e.target.closest('.card')?.classList.toggle('open');
});
$('#btn-refresh').addEventListener('click', async () => { scene?.pulse(); await load(true); toast('Обновлено'); });

function downloadIcs(ev) {
  if (!ev) return;
  const z = d => d.toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const s = ev._s, en = ev.end ? new Date(ev.end) : new Date(s.getTime() + 2 * 36e5);
  const t = x => String(x || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Surmulys//LT', 'BEGIN:VEVENT', `UID:${ev.id}@surmulys`, `DTSTAMP:${z(new Date())}`,
    `DTSTART:${z(s)}`, `DTEND:${z(en)}`, `SUMMARY:${t(ev.title)}`, `LOCATION:${t([ev.venue, ev.address].filter(Boolean).join(', '))}`,
    `URL:${safeUrl(ev.url)}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([body], { type: 'text/calendar' })), download: 'event.ics' });
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast('Событие скачано — откройте файл, чтобы добавить в календарь');
}

let tt; function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2600); }

/* ---------- установка ---------- */
let deferred;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; $('#btn-install').hidden = false; });
$('#btn-install').addEventListener('click', async () => { if (!deferred) return; deferred.prompt(); await deferred.userChoice; deferred = null; $('#btn-install').hidden = true; });
const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone;
if (ios) { const b = $('#btn-install'); b.hidden = false; b.textContent = '⤓ На экран «Домой»'; b.onclick = () => toast('Поделиться → «На экран Домой»'); }

/* ---------- ежедневная сводка ---------- */
// Настоящих push-уведомлений без сервера не бывает, поэтому: (1) при открытии приложения,
// (2) через Periodic Background Sync там, где браузер это разрешает (Chrome/Android, установленное PWA).
function digestText() {
  const t = dayKey(new Date()), list = state.all.filter(e => e._k0 <= t && e._k1 >= t).sort((a, b) => a._s - b._s);
  if (!list.length) return null;
  return { title: `Сегодня в Вильнюсе: ${list.length}`, body: list.slice(0, 3).map(e => `${e._time || '•'} ${e.title}`).join('\n') };
}
async function maybeDigest() {
  try {
    if (localStorage.getItem('surmulys.digest') !== '1' || Notification.permission !== 'granted') return;
    const t = dayKey(new Date());
    if (localStorage.getItem('surmulys.digestDay') === t) return;
    const d = digestText(); if (!d) return;
    localStorage.setItem('surmulys.digestDay', t);
    const reg = await navigator.serviceWorker?.ready;
    reg ? reg.showNotification(d.title, { body: d.body, icon: 'icons/icon-192.png', tag: 'digest' }) : new Notification(d.title, { body: d.body });
  } catch {}
}
$('#btn-digest').addEventListener('click', async () => {
  try {
    if (!('Notification' in window)) return toast('Этот браузер не поддерживает уведомления');
    const on = localStorage.getItem('surmulys.digest') === '1' && Notification.permission === 'granted';
    if (on) { localStorage.setItem('surmulys.digest', '0'); return toast('Сводка выключена'); }
    const p = await Notification.requestPermission();
    if (p !== 'granted') return toast('Разрешите уведомления в настройках браузера');
    localStorage.setItem('surmulys.digest', '1');
    const reg = await navigator.serviceWorker?.ready;
    try { await reg?.periodicSync?.register('daily-digest', { minInterval: 12 * 36e5 }); } catch {}
    toast('Сводка включена: покажу при открытии приложения'); maybeDigest();
  } catch { toast('Не получилось включить сводку'); }
});

/* ---------- старт ---------- */
$('#list').innerHTML = '<div class="grid">' + '<div class="skeleton"></div>'.repeat(3) + '</div>';
$('#today-label').textContent = 'Вильнюс · ' + cap(fmtLong.format(new Date()));
document.fonts?.ready.then(movePill); movePill(); addEventListener('resize', movePill);
load();
// пока приложение открыто — подтягиваем свежие данные раз в 30 минут и при возвращении на вкладку
setInterval(() => load(true), 30 * 60 * 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) load(true); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
