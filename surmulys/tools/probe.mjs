// Диагностика источников (запускается вручную/при пуше): что отдаёт каждый сайт.
const UA = 'Mozilla/5.0 (compatible; SurmulysBot/1.0)';
const urls = (process.env.URLS || '').split(/\s+/).filter(Boolean);
for (const spec of urls) {
  const [u, ctxRe] = spec.split('@@');
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'lt,en' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const h = await r.text();
    const types = [...h.matchAll(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => { try { const j = JSON.parse(m[1]); return JSON.stringify([].concat(j['@graph'] || j).map(x => x['@type'] + (x.itemListElement ? `[list ${x.itemListElement.length}]` : '')).slice(0, 4)); } catch { return 'bad'; } });
    const links = [...new Set([...h.matchAll(/href=["']([^"'#]+)["']/gi)].map(m => m[1]))].filter(x => /event|rengin|koncert|spektak|bilet|ticket|whats|show|\/e\//i.test(x));
    console.log(`\n### ${u}\nHTTP ${r.status} → ${r.url} | ${h.length} bytes | title: ${(h.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim()}`);
    console.log('ld+json:', types.join(' ') || 'нет', '| __NEXT_DATA__:', /__NEXT_DATA__/.test(h), '| nuxt:', /__NUXT__/.test(h));
    console.log('links(%d):', links.length, links.slice(0, 25).join('  '));
    const firstEv = [...h.matchAll(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1]).find(x => /"@type"\s*:\s*"[A-Za-z]*Event"/.test(x));
    if (firstEv) console.log('EVENT-LD:', firstEv.replace(/\s+/g, ' ').slice(0, 900));
    console.log('h1:', (h.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1]?.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 120));
    const dt = h.match(/(\d{4}-\d{2}-\d{2}T[\d:]+[^"'<\s]*)/g); if (dt) console.log('iso-dates:', [...new Set(dt)].slice(0, 5).join(' '));
    if (ctxRe === 'HEAD') console.log('HEAD:', h.replace(/\s+/g, ' ').slice(0, 2500));
    else if (ctxRe) { const re = new RegExp(ctxRe, 'i'); const m = re.exec(h); if (m) console.log('CTX:', h.slice(Math.max(0, m.index - 500), m.index + 900).replace(/\s+/g, ' ')); else console.log('CTX: no match'); }
    const sm = h.match(/https?:\/\/[^"'\s]+(?:\.json|\/api\/[^"'\s]*)/g); if (sm) console.log('api/json:', [...new Set(sm)].slice(0, 6).join('  '));
  } catch (e) { console.log(`\n### ${u}\nERR ${e.message}`); }
}
