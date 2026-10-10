// Šurmulys: ежедневный сбор событий Вильнюса -> ../data/events.json
// Без зависимостей (Node 20+). Запускается в GitHub Actions, но работает и локально.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createHash } from 'node:crypto';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = process.env.OUT || path.join(here, '..', 'data', 'events.json');
const UA = 'Mozilla/5.0 (compatible; SurmulysBot/1.0; +https://github.com/etozheprime-jpg/iosapps)';
const TM_KEY = process.env.TICKETMASTER_KEY || '';
const HORIZON_DAYS = 120;

const log = (...a) => console.log(...a);

async function get(url, { json = false } = {}) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 20000);
  try {
    const r = await fetch(url, { signal: ctl.signal, redirect: 'follow',
      headers: { 'user-agent': UA, 'accept-language': 'lt,en;q=0.8,ru;q=0.6', accept: json ? 'application/json' : 'text/html,*/*' } });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return json ? await r.json() : await r.text();
  } finally { clearTimeout(t); }
}

// ---------- JSON-LD ----------
function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    const raw = m[1].trim().replace(/^<!--|-->$/g, '');
    try { out.push(JSON.parse(raw)); } catch { /* битый блок — пропускаем */ }
  }
  return out;
}
function* walk(node) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) { for (const n of node) yield* walk(n); return; }
  yield node;
  for (const k of ['@graph', 'itemListElement', 'item', 'subEvent', 'event']) if (node[k]) yield* walk(node[k]);
}
const isEvent = n => [].concat(n['@type'] || []).some(t => /Event$/i.test(String(t))) || (n.startDate && n.name && n.location);

const txt = v => (v == null ? '' : typeof v === 'string' ? v : Array.isArray(v) ? txt(v[0]) : v.name || v.url || v['@id'] || '');
const clean = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
  .replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();

function abs(u, base) { try { return new URL(u, base).href; } catch { return ''; } }

const VILNIUS_VENUES = /compensa|avia solutions|siemens|ledo|nacionalin|operos ir baleto|filharmonij|skalvij|forum palace|kino pasaulis|menų spaustuv|lukiškių|palėp|tamsta|kablys|pakaln|vingio|sporto rūmai|\bmo muziej|rotuš|vilniaus|\blrt\b|ožio|\bbix\b|loft|pylimo|rūmai|kultūros ir sporto|arkikatedr|bernardin|kongres|litexpo|lvso|ltmc|jaunimo teatr|rusų dramos|mažasis|oskaro korš|keistuolių|menų fabrik|užupio|gedimino|trakų|bažnyči|šv\. kotryn|vilnius/i;

function fromLd(n, src, pageUrl) {
  const start = toIso(n.startDate);
  if (!start || !n.name) return null;
  const loc = [].concat(n.location || [])[0] || {};
  const addr = loc.address || {};
  const addrText = typeof addr === 'string' ? addr
    : [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean).join(', ');
  const place = clean(txt(loc)) || '';
  const hay = (addrText + ' ' + place + ' ' + clean(txt(n.name))).toLowerCase();
  const inVilnius = /vilni|вильн/.test(hay);
  const knownElsewhere = /kaun|klaip|šiaul|siaul|panevėž|panevez|palang|alyt|trakai|ryga|riga|warsaw|varšuv/.test(hay) && !inVilnius;
  if (knownElsewhere) return null;
  if (src.needVilniusVenue && !inVilnius && !VILNIUS_VENUES.test(place + ' ' + addrText)) return null;
  if (!inVilnius && !src.assumeVilnius && !src.needVilniusVenue && addrText) return null;       // адрес есть, но не Вильнюс
  if (!inVilnius && !src.assumeVilnius && !addrText && !place) return null; // вообще нет места — не берём
  const offers = [].concat(n.offers || [])[0] || {};
  const price = offers.lowPrice || offers.price;
  return {
    title: clean(txt(n.name)).slice(0, 140),
    start,
    end: toIso(n.endDate) || undefined,
    venue: place.slice(0, 90) || undefined,
    address: clean(addrText).slice(0, 120) || undefined,
    description: clean(n.description).slice(0, 280) || undefined,
    image: txt(n.image) ? abs(txt(n.image), pageUrl) : undefined,
    url: abs(n.url || pageUrl, pageUrl),
    price: price != null && price !== '' ? `${price} ${offers.priceCurrency || '€'}`.replace(/EUR/, '€') : undefined,
    source: src.name,
  };
}

function toIso(v) {
  if (!v) return '';
  const s = String(v).trim();
  const d = new Date(s);
  if (isNaN(d)) return '';
  // дата без времени/зоны — считаем локальной вильнюсской полночью
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s + 'T00:00:00' + vilniusOffset(new Date(s + 'T12:00:00Z'));
  if (!/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) return s.replace(' ', 'T').slice(0, 19) + vilniusOffset(d);
  return d.toISOString();
}
function vilniusOffset(d) {
  const p = new Intl.DateTimeFormat('en', { timeZone: 'Europe/Vilnius', timeZoneName: 'longOffset' })
    .formatToParts(d).find(x => x.type === 'timeZoneName')?.value || 'GMT+02:00';
  const m = p.match(/([+-]\d{2}):?(\d{2})/);
  return m ? `${m[1]}:${m[2]}` : '+02:00';
}

async function scrapeSource(src) {
  const html = await get(src.url);
  let events = [];
  const take = (h, url) => {
    for (const b of jsonLdBlocks(h)) for (const n of walk(b)) if (isEvent(n)) {
      const e = fromLd(n, src, url); if (e) events.push(e);
    }
  };
  take(html, src.url);
  const found = events.length;
  const extra = new Set();
  for (const rss of src.rssLinks || []) {
    try {
      const x = await get(rss);
      for (const m of x.matchAll(/<link>\s*(?:<!\[CDATA\[)?\s*(https?:[^\]<\s]+)/gi)) extra.add(m[1]);
    } catch (e) { log(`   RSS ${rss}: ${e.message}`); }
  }
  log(`   ссылок из RSS: ${extra.size}`);
  if ((src.linkPattern || extra.size) && src.maxLinks) {
    const re = new RegExp(src.linkPattern || '$^', 'gi');
    const links = new Set();
    const hrefRe = /href=["']([^"']+)["']/gi;
    let m;
    while ((m = hrefRe.exec(html))) {
      const u = abs(m[1], src.url);
      if (u && u !== src.url && new URL(u).host === new URL(src.url).host && re.test(new URL(u).pathname)) links.add(u.split('#')[0]);
      re.lastIndex = 0;
    }
    const list = [...new Set([...links, ...extra])].filter(u => !/\/RSS$/i.test(u)).slice(0, src.maxLinks);
    let ok = 0;
    for (let i = 0; i < list.length; i += 5) {
      await Promise.all(list.slice(i, i + 5).map(async u => {
        try { take(await get(u), u); ok++; } catch { /* пропускаем */ }
      }));
    }
    log(`   страниц по ссылкам: ${ok}/${list.length}`);
  }
  log(`   JSON-LD на списке: ${found}, всего: ${events.length}`);
  return events;
}

// ---------- Ticketmaster (опционально, нужен ключ) ----------
async function ticketmaster() {
  const out = [];
  const now = new Date(); const end = new Date(Date.now() + HORIZON_DAYS * 864e5);
  const f = d => d.toISOString().replace(/\.\d+Z$/, 'Z');
  const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${TM_KEY}&city=Vilnius&countryCode=LT&size=200&sort=date,asc&startDateTime=${f(now)}&endDateTime=${f(end)}`;
  const j = await get(url, { json: true });
  for (const e of j?._embedded?.events || []) {
    const v = e._embedded?.venues?.[0];
    const dt = e.dates?.start;
    const start = dt?.dateTime || (dt?.localDate ? toIso(dt.localDate + (dt.localTime ? 'T' + dt.localTime : '')) : '');
    if (!start) continue;
    out.push({ title: e.name, start: toIso(start), venue: v?.name, address: v?.address?.line1,
      image: (e.images || []).sort((a, b) => b.width - a.width)[0]?.url, url: e.url, source: 'Ticketmaster',
      category: e.classifications?.[0]?.segment?.name,
      price: e.priceRanges?.[0] ? `${e.priceRanges[0].min} ${e.priceRanges[0].currency}` : undefined });
  }
  return out;
}

// ---------- категории ----------
const CATS = [
  ['kids',     /vaik|kids|children|šeim|seim|family|детск|lėlių|lelių|pasak|mažyl|mazyl|su vaikais|multfilm|trolia|pukuotuk/i],
  ['sport',    /krepšin|krepsin|futbol|football|basket|sport|marathon|maratonas|bėgim|begim|\brun\b|žalgir|zalgir|ritulys|teniso|euroleague|rytas|velo|joga|yoga|treniruot/i],
  ['film',     /kino\b|kino teatr|film|cinema|kinas|фильм|premjer|pasaka\b|skalvij|forum cinemas/i],
  ['theatre',  /spektakl|teatr|theat|opera|baletas|ballet|театр|спектакл|balet|miuzikl|musical|stand.?up|komedij|comedy|improv|impro|šokio|sokio|dance/i],
  ['expo',     /parod|exhib|muziej|museum|galerij|gallery|выставк|ekspozic|instaliacij|atidarym|ekskurs|excursion|tour of|pėsčiom|walking tour|menų|art\b/i],
  ['festival', /festival|\bfest\b|šventė|sventė|jomark|mugė|muge|market|\bfair\b|фестивал|ярмарк|helovin|halloween/i],
  ['night',    /party|vakarėl|vakarel|club|klubas|\bnight\b|naktis|nacht|вечеринк|after.?party|\bdj\b|techno|rave|elastica|loftas|tamsta|bix|kablys|jam session|karaoke/i],
  ['concert',  /koncert|concert|gig|live\b|jazz|d[žz]iaz|rock\b|рок|концерт|simfon|choir|choras|orkestr|recitalis|\btour\b|lvso|filharmon|kamerin|vargon|candlelight|album|dainų|dainu|muzik|music|band\b|quartet|kvartet|trio\b|symphon/i],
  ['talk',     /paskait|lecture|conference|konferenc|workshop|dirbtuv|seminar|meetup|forum|diskusij|knyg|book|лекци|summit|mokym|training|networking|webinar|kursai|pristatym|susitikim/i],
];
function categorize(e) {
  if (e.category && CATS.some(([k]) => k === e.category)) return e.category;
  // сначала заголовок, затем заголовок+описание+зал (так «Compensa» не превращает всё в концерты раньше времени)
  const t1 = `${e.title}`, t2 = `${e.title} ${e.venue || ''} ${e.description || ''}`;
  for (const t of [t1, t2]) for (const [k, re] of CATS) if (re.test(t)) return k;
  return 'other';
}

// ---------- main ----------
const cfg = JSON.parse(await readFile(process.env.SOURCES || path.join(here, 'sources.json'), 'utf8'));
let all = [];
const report = [];
for (const src of cfg.sources) {
  log(`→ ${src.name} (${src.url})`);
  try {
    const ev = await scrapeSource(src);
    report.push({ source: src.name, ok: true, count: ev.length });
    all.push(...ev);
  } catch (err) {
    log(`   ✗ ${err.message}`);
    report.push({ source: src.name, ok: false, error: String(err.message) });
  }
}
if (TM_KEY) {
  log('→ Ticketmaster API');
  try { const ev = await ticketmaster(); log(`   событий: ${ev.length}`); report.push({ source: 'Ticketmaster', ok: true, count: ev.length }); all.push(...ev); }
  catch (err) { log(`   ✗ ${err.message}`); report.push({ source: 'Ticketmaster', ok: false, error: String(err.message) }); }
}

// окно: от «вчера» (чтобы идущие сейчас не пропадали) до HORIZON_DAYS
const from = Date.now() - 864e5, to = Date.now() + HORIZON_DAYS * 864e5;
const seen = new Map();
const noTime = iso => /T00:00(:00)?(\.000)?([+-]\d\d:\d\d|Z)?$/.test(iso);
for (const e of all) {
  const t = Date.parse(e.start);
  const endT = e.end ? Date.parse(e.end) : t;
  if (isNaN(t) || endT < from || t > to) continue;
  // ключ: нормализованное название + день (залы на разных сайтах пишутся по-разному)
  const key = e.title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim().slice(0, 60) + '|' + e.start.slice(0, 10);
  if (!seen.has(key)) { seen.set(key, { ...e }); continue; }
  const o = seen.get(key);
  if (noTime(o.start) && !noTime(e.start)) o.start = e.start;   // предпочитаем запись, где известно время
  for (const k of Object.keys(e)) if (!o[k] && e[k]) o[k] = e[k];
}
for (const o of seen.values()) o.category = categorize(o);
let events = [...seen.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start)).slice(0, 800);
const ids = new Set();
events = events.map(e => {
  // стабильный id (не зависит от порядка) — на нём держится «Избранное» в приложении
  let id = createHash('sha1').update(`${e.title}|${e.start}|${e.venue || ''}`).digest('hex').slice(0, 10);
  while (ids.has(id)) id += 'x';
  ids.add(id);
  return Object.fromEntries(Object.entries({ id, ...e }).filter(([, v]) => v !== undefined && v !== ''));
});

// не трогаем файл, если ничего не изменилось (и свежесть < 20 ч) — меньше шума в истории коммитов
let prev = null;
try { prev = JSON.parse(await readFile(OUT, 'utf8')); } catch {}
const same = prev && JSON.stringify(prev.events.map(({ id, ...r }) => r)) === JSON.stringify(events.map(({ id, ...r }) => r));
const fresh = prev && Date.now() - Date.parse(prev.generatedAt) < 20 * 36e5;
const allFailed = report.length && report.every(r => !r.ok);

if (!events.length && prev?.events?.length) {
  log('Новых событий не найдено — оставляю прежний файл (источники недоступны или сменили разметку).');
} else if (same && fresh) {
  log('Без изменений.');
} else {
  await writeFile(OUT, JSON.stringify({ generatedAt: new Date().toISOString(), city: 'Vilnius', sources: report, events }, null, 1) + '\n');
  log(`Записано событий: ${events.length}`);
}
log('\nИтог по источникам:'); for (const r of report) log(' ', r.ok ? '✓' : '✗', r.source, r.ok ? r.count : r.error);
if (allFailed) process.exitCode = 0; // не валим workflow — приложение продолжит показывать прежние данные
