// Диагностика источников (запускается вручную/при пуше): что отдаёт каждый сайт.
const UA = 'Mozilla/5.0 (compatible; SurmulysBot/1.0)';
const urls = (process.env.URLS || '').split(/\s+/).filter(Boolean);
for (const u of urls) {
  try {
    const r = await fetch(u, { headers: { 'user-agent': UA, 'accept-language': 'lt,en' }, redirect: 'follow', signal: AbortSignal.timeout(20000) });
    const h = await r.text();
    const types = [...h.matchAll(/<script[^>]+ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => { try { const j = JSON.parse(m[1]); return JSON.stringify([].concat(j['@graph'] || j).map(x => x['@type'] + (x.itemListElement ? `[list ${x.itemListElement.length}]` : '')).slice(0, 4)); } catch { return 'bad'; } });
    const links = [...new Set([...h.matchAll(/href=["']([^"'#]+)["']/gi)].map(m => m[1]))].filter(x => /event|rengin|koncert|spektak|bilet|ticket|whats|show|\/e\//i.test(x));
    console.log(`\n### ${u}\nHTTP ${r.status} → ${r.url} | ${h.length} bytes | title: ${(h.match(/<title[^>]*>([^<]*)/i) || [])[1]?.trim()}`);
    console.log('ld+json:', types.join(' ') || 'нет', '| __NEXT_DATA__:', /__NEXT_DATA__/.test(h), '| nuxt:', /__NUXT__/.test(h));
    console.log('links(%d):', links.length, links.slice(0, 12).join('  '));
    const sm = h.match(/https?:\/\/[^"'\s]+(?:\.json|\/api\/[^"'\s]*)/g); if (sm) console.log('api/json:', [...new Set(sm)].slice(0, 6).join('  '));
  } catch (e) { console.log(`\n### ${u}\nERR ${e.message}`); }
}
