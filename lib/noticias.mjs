// Noticias cripto por RSS público (Cointelegraph, Decrypt, CoinDesk) + Fear & Greed (alternative.me).
// Filtra por moneda, marca noticias macro y calcula un sentimiento simple por palabras clave.

export const FEEDS = [
  ['cointelegraph', 'https://cointelegraph.com/rss'],
  ['decrypt', 'https://decrypt.co/feed'],
  ['coindesk', 'https://www.coindesk.com/arc/outboundfeeds/rss/'],
];

export const NOMBRES = {
  BTC: ['bitcoin', 'btc'], ETH: ['ethereum', 'ether', 'eth'], SOL: ['solana', 'sol'], XRP: ['xrp', 'ripple'],
  BNB: ['bnb', 'binance coin', 'bnb chain'], DOGE: ['dogecoin', 'doge'], ADA: ['cardano', 'ada'], TRX: ['tron', 'trx'],
  AVAX: ['avalanche', 'avax'], LINK: ['chainlink', 'link'], DOT: ['polkadot', 'dot'], TON: ['toncoin', 'ton'],
  SUI: ['sui'], APT: ['aptos', 'apt'], ARB: ['arbitrum', 'arb'], OP: ['optimism'], MNT: ['mantle', 'mnt'],
  LTC: ['litecoin', 'ltc'], BCH: ['bitcoin cash', 'bch'], NEAR: ['near protocol', 'near'], PEPE: ['pepe'],
  SHIB: ['shiba inu', 'shib'], WIF: ['dogwifhat', 'wif'], HYPE: ['hyperliquid', 'hype'], ENA: ['ethena', 'ena'],
  INJ: ['injective', 'inj'], TIA: ['celestia', 'tia'], SEI: ['sei'], UNI: ['uniswap', 'uni'], AAVE: ['aave'],
  FIL: ['filecoin', 'fil'], ATOM: ['cosmos', 'atom'], HBAR: ['hedera', 'hbar'], XLM: ['stellar', 'xlm'],
  TAO: ['bittensor', 'tao'], RENDER: ['render', 'rndr'], FET: ['fetch.ai', 'fet', 'artificial superintelligence alliance'],
  JUP: ['jupiter', 'jup'], ONDO: ['ondo'], POL: ['polygon', 'pol', 'matic'], TRUMP: ['trump coin', 'official trump', '$trump'],
};

const MACRO = ['fed', 'fomc', 'powell', 'cpi', 'inflation', 'interest rate', 'rate cut', 'rate hike', 'tariff', 'jobs report',
  'nonfarm', 'recession', 'treasury', 'sec ', 'etf', 'stablecoin bill', 'regulation', 'market crash', 'liquidations'];

const ALCISTAS = ['surge', 'soar', 'rally', 'jump', 'gain', 'record high', 'all-time high', 'ath', 'breakout', 'bullish',
  'approval', 'approved', 'approves', 'partnership', 'adopt', 'launch', 'listing', 'lists', 'inflow', 'upgrade', 'buy',
  'accumulat', 'rebound', 'recover', 'outperform', 'etf filing', 'integration', 'rate cut', 'climb', 'rise'];
const BAJISTAS = ['plunge', 'crash', 'dump', 'drop', 'fall', 'slump', 'tumble', 'bearish', 'hack', 'exploit', 'drain',
  'stolen', 'lawsuit', 'sues', 'charged', 'fraud', 'delist', 'outflow', 'liquidat', 'sell-off', 'selloff', 'ban',
  'outage', 'halt', 'down', 'reject', 'denied', 'warning', 'rate hike', 'investigation', 'bankrupt', 'collapse', 'slide',
  'dip', 'bleed', 'sink', 'loss', 'cuts off', 'cut off', 'sanction', 'illicit', 'probe', 'crackdown', 'fear', 'rout', 'pressure'];
const RIESGO = ['hack', 'exploit', 'drain', 'stolen', 'delist', 'outage', 'halt', 'bankrupt', 'collapse', 'insolven', 'rug'];

const decode = (s) => s
  .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
  .replace(/&#0?39;|&apos;|&#8217;|&#8216;/g, "'").replace(/&#8220;|&#8221;/g, '"').replace(/&#\d+;/g, ' ')
  .replace(/\s+/g, ' ').trim();

const campo = (item, tag) => {
  const m = item.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? decode(m[1]) : '';
};

export function parsearRSS(xml, fuente) {
  const items = [];
  for (const m of xml.matchAll(/<item[\s>][\s\S]*?<\/item>/gi)) {
    const it = m[0];
    const t = Date.parse(campo(it, 'pubDate') || campo(it, 'dc:date'));
    items.push({ fuente, titulo: campo(it, 'title'), enlace: campo(it, 'link'), fecha: Number.isFinite(t) ? t : null, resumen: campo(it, 'description').slice(0, 300) });
  }
  return items;
}

const re = (w) => new RegExp(`(^|[^a-z0-9$])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9])`, 'i');
const tiene = (texto, palabras) => palabras.some((w) => re(w).test(texto));
// comienzo de palabra: "gain" cuenta en "gains" pero no en "again"
const cuenta = (texto, palabras) => palabras.filter((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(texto)).length;

export function sentimientoTexto(texto) {
  const a = cuenta(texto, ALCISTAS), b = cuenta(texto, BAJISTAS);
  return a + b ? (a - b) / (a + b) : 0;
}

// moneda: base (SOL). Devuelve noticias de la moneda, macro, sentimiento y evento de riesgo.
export function filtrar(items, moneda, { desde = 0, extra = [] } = {}) {
  const claves = [...(NOMBRES[moneda] || [moneda.toLowerCase()]), ...extra];
  const vistos = new Set();
  const propias = [], macro = [];
  for (const it of items.sort((a, b) => (b.fecha || 0) - (a.fecha || 0))) {
    if (it.fecha && it.fecha < desde) continue;
    const k = it.titulo.toLowerCase().slice(0, 60);
    if (vistos.has(k)) continue;
    vistos.add(k);
    const texto = `${it.titulo} ${it.resumen}`;
    const s = +sentimientoTexto(it.titulo + ' ' + it.titulo + ' ' + it.resumen).toFixed(2);
    const conTag = { ...it, sentimiento: s, riesgo: tiene(texto.toLowerCase(), RIESGO) };
    if (tiene(it.titulo, claves) || (moneda !== 'BTC' && tiene(it.resumen, claves.filter((c) => c.length > 3)))) propias.push(conTag);
    else if (tiene(texto, MACRO) || tiene(it.titulo, NOMBRES.BTC)) macro.push(conTag);
  }
  const pesoEdad = (t, ahora) => (t ? Math.max(0.2, 1 - (ahora - t) / (24 * 3600e3)) : 0.3);
  const ahora = Math.max(...items.map((i) => i.fecha || 0), desde);
  let s = 0, w = 0;
  for (const it of propias) { const p = pesoEdad(it.fecha, ahora); s += p * it.sentimiento; w += p; }
  for (const it of macro.slice(0, 10)) { const p = 0.3 * pesoEdad(it.fecha, ahora); s += p * it.sentimiento; w += p; }
  const riesgo = propias.find((i) => i.riesgo && i.sentimiento < 0 && i.fecha && ahora - i.fecha < 12 * 3600e3);
  return {
    moneda, propias, macro, sentimiento: w ? +(s / w).toFixed(2) : 0,
    evento_riesgo: riesgo ? riesgo.titulo : null,
  };
}

export async function leerNoticias(fuente, moneda, { horas = 24, desde = null } = {}) {
  const items = [], errores = [];
  for (const [nombre, url] of FEEDS) {
    try { items.push(...parsearRSS(await fuente.texto(url, `rss-${nombre}.xml`), nombre)); } catch (e) { errores.push(`${nombre}: ${e.message}`); }
  }
  const d = desde ?? fuente.ahora() - horas * 3600e3;
  return { ...filtrar(items, moneda, { desde: d }), errores, total_leidas: items.length };
}

// Fear & Greed de alternative.me (diario, 0-100): hoy, ayer, hace una semana y los últimos 30 días.
export async function miedoCodicia(fuente) {
  try {
    const j = JSON.parse(await fuente.texto('https://api.alternative.me/fng/?limit=31', 'fng.json'));
    const d = j.data || [];
    const [hoy, ayer] = d;
    const trad = { 'Extreme Fear': 'Miedo extremo', Fear: 'Miedo', Neutral: 'Neutral', Greed: 'Codicia', 'Extreme Greed': 'Codicia extrema' };
    return {
      valor: +hoy.value, clase: trad[hoy.value_classification] || hoy.value_classification, ayer: ayer ? +ayer.value : null,
      semana: d[7] ? +d[7].value : null,
      historial: d.map((x) => ({ t: +x.timestamp * 1000, valor: +x.value })).reverse(),
    };
  } catch { return null; }
}

// Lectura del Fear & Greed para una operación corta: no da dirección por sí solo, pero en los extremos
// avisa del riesgo de ir con la masa (codicia extrema + LONG, miedo extremo + SHORT).
export function efectoFNG(fng, lado) {
  if (!fng || !Number.isFinite(fng.valor)) return { ajuste_conf: 0, texto: null };
  const v = fng.valor, L = lado === 'LONG' ? 1 : -1;
  if (v >= 80 && L > 0) return { ajuste_conf: -5, texto: `Fear & Greed ${v} (codicia extrema): el mercado está eufórico, un LONG va con la masa y hay riesgo de barrida hacia abajo.` };
  if (v <= 20 && L < 0) return { ajuste_conf: -5, texto: `Fear & Greed ${v} (miedo extremo): el pánico ya está en el precio, un SHORT va con la masa y hay riesgo de rebote brusco.` };
  if (v >= 75 && L < 0) return { ajuste_conf: 2, texto: `Fear & Greed ${v}: euforia, un SHORT va contra la masa (suele pagar en las barridas).` };
  if (v <= 25 && L > 0) return { ajuste_conf: 2, texto: `Fear & Greed ${v}: miedo, un LONG va contra la masa (suele pagar en los rebotes).` };
  return { ajuste_conf: 0, texto: null };
}
