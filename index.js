// ╔══════════════════════════════════════════════════════════════════════════════╗
// ║  ATLAS DE CONFLICTOS — Servidor RSS v2.0                                    ║
// ║  Fuentes verificadas y funcionales (2025-2026)                               ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  Instalar: npm install express rss-parser cors                              ║
// ║  Ejecutar: node rss-server.js                                               ║
// ║  Puerto:   http://localhost:3001                                             ║
// ╠══════════════════════════════════════════════════════════════════════════════╣
// ║  ESTADO DE FUENTES (verificado marzo 2026):                                 ║
// ║  REEMPLAZADAS: Reuters (eliminó RSS en 2020), RT (bloqueado), CGTN (sin XML)║
// ║  NUEVAS:  BBC (8 feeds regionales), Al Jazeera, DW, NPR, Guardian, F24     ║
// ╚══════════════════════════════════════════════════════════════════════════════╝

const express = require('express');
const cors    = require('cors');
const Parser  = require('rss-parser');

const app = express();
app.use(cors({
  origin: '*',
  methods: ['GET'],
  allowedHeaders: ['Content-Type']
}));
app.use(express.json());

const parser = new Parser({
  timeout: 12000,
  headers: {
    'User-Agent': 'Mozilla/5.0 (compatible; AtlasConflictos/2.0)',
    'Accept': 'application/rss+xml, application/xml, text/xml, */*',
  },
  customFields: { item: ['media:thumbnail', 'media:content', 'dc:creator'] }
});

// ─── FEEDS VERIFICADOS Y FUNCIONALES ─────────────────────────────────────────
const FEEDS = {
  bbc:         'https://feeds.bbci.co.uk/news/world/rss.xml',
  bbc_mid:     'https://feeds.bbci.co.uk/news/world/middle_east/rss.xml',
  bbc_africa:  'https://feeds.bbci.co.uk/news/world/africa/rss.xml',
  bbc_asia:    'https://feeds.bbci.co.uk/news/world/asia/rss.xml',
  bbc_europe:  'https://feeds.bbci.co.uk/news/world/europe/rss.xml',
  bbc_latam:   'https://feeds.bbci.co.uk/news/world/latin_america/rss.xml',
  aljazeera:   'https://www.aljazeera.com/xml/rss/all.xml',
  dw:          'https://rss.dw.com/xml/rss-en-world',
  npr:         'https://feeds.npr.org/1004/rss.xml',
  cnn:         'http://rss.cnn.com/rss/edition.rss',
  cnn_world:   'http://rss.cnn.com/rss/edition_world.rss',
  cnn_americas:'http://rss.cnn.com/rss/edition_americas.rss',
  guardian:    'https://www.theguardian.com/world/rss',
  france24:    'https://www.france24.com/en/rss',
  // ── CHILE ──────────────────────────────────────────────────────────────────
  // Cooperativa: URLs correctas por sección (verificadas marzo 2026)
  coop_pais:    'https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml',
  coop_mundo:   'https://www.cooperativa.cl/noticias/site/tax/port/all/rss_2___1.xml',
  coop_econ:    'https://www.cooperativa.cl/noticias/site/tax/port/all/rss_6___1.xml',
  // BioBioChile: único feed XML público encontrado (widget Chrome)
  biobio:       'https://widgets.biobiochile.cl/rss-bbcl-chrome/feedchrome.xml',
  theclinic:    'https://www.theclinic.cl/feed/',
  ciper:        'https://www.ciperchile.cl/feed/',
  // ── ARGENTINA (verificados feedspot feb 2026) ──────────────────────────────
  // Infobae usa arc/outboundfeeds (sitemap, no RSS estándar) — incompatible con rss-parser
  // Página/12 requiere suscripción para XML completo
  lanacion:     'https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml',
  batimes:      'https://www.batimes.com.ar/feed',
  perfil:       'https://www.perfil.com/feed',
};

const FEED_LABELS = {
  bbc:'BBC', bbc_mid:'BBC Oriente Medio', bbc_africa:'BBC África',
  bbc_asia:'BBC Asia', bbc_europe:'BBC Europa', bbc_latam:'BBC América Latina',
  aljazeera:'Al Jazeera', dw:'Deutsche Welle', npr:'NPR',
  cnn:'CNN', cnn_world:'CNN World', cnn_americas:'CNN Américas',
  guardian:'The Guardian', france24:'France 24',
  coop_pais:'Cooperativa', coop_mundo:'Cooperativa', coop_econ:'Cooperativa',
  biobio:'BioBioChile', theclinic:'The Clinic', ciper:'CIPER Chile',
  lanacion:'La Nación', batimes:'Buenos Aires Times', perfil:'Perfil',
};

// ─── CACHÉ ────────────────────────────────────────────────────────────────────
const cache = {};
const CACHE_TTL = 8 * 60 * 1000;

async function getFeed(key) {
  const url = FEEDS[key];
  if (!url) return [];
  const now = Date.now();
  if (cache[key] && now - cache[key].ts < CACHE_TTL) return cache[key].items;
  try {
    const feed  = await parser.parseURL(url);
    const items = (feed.items || []).slice(0, 80).map(item => ({
      title:   (item.title || '').trim(),
      summary: (item.contentSnippet || item.summary || item.content || '').replace(/<[^>]*>/g, '').trim(),
      link:    item.link || item.guid || '',
      date:    item.pubDate || item.isoDate || '',
      source:  FEED_LABELS[key] || key,
    }));
    cache[key] = { ts: now, items };
    console.log(`  OK [${key}] ${items.length} articulos`);
    return items;
  } catch (err) {
    console.warn(`  FALLA [${key}] ${err.message}`);
    return cache[key]?.items || [];
  }
}

function scoreItem(item, keywords) {
  const text = (item.title + ' ' + item.summary).toLowerCase();
  let score = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      score += item.title.toLowerCase().includes(kw.toLowerCase()) ? 2 : 1;
    }
  }
  return score;
}

// ─── CONFIGURACIÓN POR EVENTO ─────────────────────────────────────────────────
const EVENTS_CFG = {
  1:  { feeds:['bbc','bbc_europe','cnn_world','aljazeera','dw'],
        keywords:['ukraine','ucrania','russia','rusia','kyiv','zelensky','putin','donbas','kharkiv','missile','ceasefire'] },
  2:  { feeds:['bbc','bbc_mid','aljazeera','cnn_world','france24'],
        keywords:['gaza','israel','hamas','palestine','palestina','netanyahu','rafah','ceasefire','idf','west bank','cisjordania'] },
  3:  { feeds:['bbc','bbc_africa','aljazeera','guardian'],
        keywords:['sudan','rsf','darfur','khartoum','jartum','al-burhan','humanitarian','famine'] },
  4:  { feeds:['bbc_africa','aljazeera','france24','dw'],
        keywords:['sahel','mali','niger','burkina faso','jihadist','islamist','wagner','al-qaeda','jnim','terrorism'] },
  5:  { feeds:['bbc','bbc_mid','aljazeera','cnn_world'],
        keywords:['yemen','houthi','red sea','mar rojo','saudi arabia','shipping','ataque','drone'] },
  6:  { feeds:['bbc_africa','aljazeera','guardian','france24'],
        keywords:['congo','drc','m23','kinshasa','goma','rwanda','ruanda','eastern congo'] },
  7:  { feeds:['bbc','cnn','guardian','npr'],
        keywords:['trump','tariff','nato','otan','white house','sanctions','executive order','maga','ukraine deal'] },
  8:  { feeds:['bbc_asia','aljazeera','cnn_world','dw'],
        keywords:['china','taiwan','strait','xi jinping','south china sea','pla','semiconductor','chips'] },
  9:  { feeds:['bbc_asia','aljazeera','dw'],
        keywords:['india','pakistan','kashmir','cachemira','modi','nuclear','islamabad','new delhi'] },
  10: { feeds:['coop_pais','ciper','theclinic','biobio'],
        keywords:['chile','boric','carabineros','crimen organizado','congreso','seguridad','tren de aragua','constitucion'] },
  11: { feeds:['bbc_latam','aljazeera','coop_mundo','lanacion'],
        keywords:['venezuela','maduro','oposicion','opposition','caracas','migrantes','migrants','represion','elecciones'] },
  12: { feeds:['bbc','bbc_mid','aljazeera','cnn_world'],
        keywords:['iran','nuclear','uranium','iaea','khamenei','sanctions','sanciones','enrichment'] },
  13: { feeds:['bbc_europe','guardian','dw','france24'],
        keywords:['europe','europa','tariff','arancel','eu trade','guerra comercial','trump','brussels','retaliation'] },
  14: { feeds:['bbc_latam','coop_mundo','aljazeera','lanacion'],
        keywords:['brazil','brasil','lula','real','inflation','economy','economía','interest rate','fiscal'] },
  15: { feeds:['bbc','aljazeera','bbc_mid'],
        keywords:['opec','oil','petróleo','crude','saudi','energy','barrel','precio petróleo','opep'] },
  16: { feeds:['bbc','cnn_americas','coop_mundo','lanacion'],
        keywords:['mexico','migración','migration','cartel','sheinbaum','border','frontera','fentanyl','sinaloa'] },
  17: { feeds:['bbc_asia','aljazeera','guardian'],
        keywords:['myanmar','burma','junta','coup','rohingya','resistance','military'] },
  18: { feeds:['bbc','guardian','npr'],
        keywords:['australia','climate','wildfire','pacific','china','indo-pacific','albanese'] },
  19: { feeds:['bbc_latam','cooperativa','aljazeera','france24','lanacion'],
        keywords:['ecuador','noboa','narco','gang','crimen organizado','estado de excepcion','quito','guayaquil'] },
  20: { feeds:['bbc_latam','aljazeera','cnn_americas','lanacion'],
        keywords:['haiti','haití','gang','port-au-prince','kenya','kenia','crisis humanitaria','ariel henry'] },
  21: { feeds:['bbc_latam','coop_mundo','aljazeera','lanacion'],
        keywords:['colombia','petro','eln','farc','paz','peace','guerrilla','bogota','disidencias'] },
  22: { feeds:['bbc_latam','coop_mundo','ciper','lanacion'],
        keywords:['peru','perú','boluarte','congreso','protest','corruption','corrupcion','lima'] },
  23: { feeds:['bbc_europe','dw','france24','aljazeera'],
        keywords:['serbia','kosovo','balkans','vucic','pristina','kurti','nato','eu accession'] },
  24: { feeds:['bbc_europe','dw','france24','aljazeera'],
        keywords:['georgia','tbilisi','abkhazia','osetia','protest','dream party','eu','nato','russia'] },
  25: { feeds:['bbc_asia','aljazeera','dw','npr'],
        keywords:['north korea','corea del norte','kim jong','missile','nuclear','pyongyang','icbm','russia'] },
  26: { feeds:['bbc_asia','aljazeera','cnn_world'],
        keywords:['south china sea','mar del sur de china','philippines','filipinas','spratly','scarborough','coast guard'] },
  27: { feeds:['bbc_africa','aljazeera','france24','dw'],
        keywords:['ethiopia','etiopía','tigray','amhara','oromia','abiy','fano','conflict','humanitarian'] },
  28: { feeds:['bbc_africa','aljazeera','guardian'],
        keywords:['somalia','al-shabaab','mogadishu','mogadiscio','islamist','drought'] },
  29: { feeds:['bbc_africa','aljazeera','guardian'],
        keywords:['mozambique','cabo delgado','insurgency','islamist','gas','ruanda','total energies'] },
  30: { feeds:['bbc_africa','aljazeera','france24'],
        keywords:['nigeria','abuja','boko haram','iswap','tinubu','naira','kidnapping','lagos'] },
  // ── NUEVOS EVENTOS 31–50 ────────────────────────────────────────────────────
  31: { feeds:['bbc','bbc_mid','aljazeera','france24'],
        keywords:['syria','siria','damascus','damasco','hts','hayat tahrir','al-jolani','transition','transición','rebels','rebeldes'] },
  32: { feeds:['bbc_asia','aljazeera','dw'],
        keywords:['afghanistan','afganistán','taliban','talibán','kabul','women','mujeres','humanitarian','hambruna','famine'] },
  33: { feeds:['bbc_europe','aljazeera','dw'],
        keywords:['azerbaijan','azerbaiyán','armenia','karabakh','karabaj','caucasus','cáucaso','peace treaty','tratado de paz'] },
  34: { feeds:['bbc_africa','aljazeera'],
        keywords:['eritrea','asmara','tigray','horn of africa','cuerno de africa','afwerki','refugees','represión'] },
  35: { feeds:['bbc_europe','dw','france24'],
        keywords:['moldova','moldavia','transnistria','chisinau','russia','eu accession','adhesión ue','gas'] },
  36: { feeds:['bbc_europe','dw','guardian'],
        keywords:['poland','polonia','belarus','bielorrusia','border','frontera','migration','migrants','hybrid war','guerra híbrida'] },
  37: { feeds:['bbc_asia','aljazeera'],
        keywords:['nepal','kathmandu','katmandú','political','china','india','earthquake','reconstruction'] },
  38: { feeds:['bbc_asia','aljazeera','dw'],
        keywords:['bangladesh','dhaka','yunus','hasina','students','protest','garment','textiles','transition'] },
  39: { feeds:['bbc_asia','aljazeera','dw'],
        keywords:['turkmenistan','turkmenistán','gas','central asia','asia central','berdimuhamedov','repression'] },
  40: { feeds:['bbc_africa','aljazeera'],
        keywords:['zimbabwe','harare','mnangagwa','inflation','economy','mugabe','crisis','opposition'] },
  41: { feeds:['bbc_africa','aljazeera','france24'],
        keywords:['cameroon','camerún','anglophone','ambazonia','separatist','separatismo','biya','northwest','southwest'] },
  42: { feeds:['bbc_africa','france24'],
        keywords:['congo brazzaville','republic of congo','sassou','oil','petróleo','debt','china','deuda'] },
  43: { feeds:['lanacion','batimes','perfil'],
        keywords:['argentina','milei','buenos aires','ajuste','economy','inflation','inflación','libertad avanza','dólar','imf','fmi'] },
  44: { feeds:['bbc_latam','aljazeera','lanacion'],
        keywords:['bolivia','la paz','arce','evo morales','mas','golpe','crisis','lithium','litio'] },
  45: { feeds:['bbc_latam','aljazeera','cnn'],
        keywords:['panama','canal','trump','sovereignty','soberanía','china','water','agua','transit','tránsito'] },
  46: { feeds:['bbc_asia','aljazeera'],
        keywords:['timor','east timor','timor oriental','oil','petróleo','poverty','pobreza','australia'] },
  47: { feeds:['bbc_asia','aljazeera'],
        keywords:['papua','png','tribal violence','violencia','highlands','resources','china','australia'] },
  48: { feeds:['bbc_europe','dw','guardian'],
        keywords:['russia','rusia','moscow','moscú','war economy','economía de guerra','sanctions','sanciones','putin','repression','represión'] },
  49: { feeds:['bbc_asia','aljazeera','dw'],
        keywords:['singapore','singapur','finance','finanzas','china','usa','hub','asean','trade','comercio'] },
  50: { feeds:['bbc_africa','aljazeera','france24'],
        keywords:['kenya','nairobi','ruto','protest','tax','impuestos','youth','haití','tech hub','africa union'] },
};

// ─── ENDPOINTS ────────────────────────────────────────────────────────────────
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'Atlas Conflictos RSS Server v2.0' });
});

app.get('/news', async (req, res) => {
  const eventId = parseInt(req.query.event);
  const limit   = Math.min(parseInt(req.query.limit) || 30, 50);
  const cfg     = EVENTS_CFG[eventId];
  if (!cfg) return res.status(404).json({ error: `Evento ${eventId} no configurado` });

  try {
    const allItems = (await Promise.all(cfg.feeds.map(getFeed))).flat();

    // Deduplicar por título
    const seen = new Set();
    const unique = allItems.filter(item => {
      const key = item.title.toLowerCase().slice(0, 60);
      if (seen.has(key)) return false;
      seen.add(key); return true;
    });

    const scored = unique
      .map(item => ({ ...item, score: scoreItem(item, cfg.keywords) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || new Date(b.date) - new Date(a.date))
      .slice(0, limit);

    if (scored.length === 0) {
      const fallback = (await getFeed(cfg.feeds[0])).slice(0, 10);
      return res.json({ items: fallback, total: fallback.length, fallback: true });
    }
    res.json({ items: scored, total: scored.length, fallback: false });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/status', async (req, res) => {
  const results = {};
  await Promise.all(Object.keys(FEEDS).map(async key => {
    try {
      const items = await getFeed(key);
      results[key] = { ok: true, count: items.length, url: FEEDS[key] };
    } catch (e) {
      results[key] = { ok: false, error: e.message, url: FEEDS[key] };
    }
  }));
  const ok  = Object.values(results).filter(r => r.ok).length;
  const bad = Object.values(results).filter(r => !r.ok).length;
  res.json({ summary: { ok, failed: bad, total: ok+bad }, feeds: results });
});

app.get('/warmup', async (req, res) => {
  const results = {};
  await Promise.all(Object.keys(FEEDS).map(async key => {
    const items = await getFeed(key);
    results[key] = items.length;
  }));
  const total = Object.values(results).reduce((a,b)=>a+b,0);
  res.json({ articlesLoaded: results, total });
});

// ─── INICIO ───────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, async () => {
  console.log(`\n✅ ATLAS RSS Server v2.0 corriendo en http://localhost:${PORT}`);
  console.log(`   /news?event=N   /status   /warmup\n`);
  console.log('Fuentes reemplazadas: Reuters (eliminó RSS 2020), RT (bloqueado), CGTN (sin feed)');
  console.log('Fuentes nuevas: BBC x6 regiones, Al Jazeera, DW, NPR, Guardian, France24\n');
  console.log('Pre-cargando feeds principales...');
  const priority = ['bbc','aljazeera','cnn','dw','guardian','coop_pais','ciper','lanacion'];
  for (const key of priority) await getFeed(key);
  console.log('Cache inicial lista.\n');
});
