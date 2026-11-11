// Dominancia del mercado cripto (CoinGecko /global, público y sin claves): qué parte de la capitalización
// total es BTC, ETH y USDT/USDC. La dominancia de las stablecoins sube cuando el dinero sale de las cripto a
// refugio (bajista para el mercado) y baja cuando vuelve a entrar (alcista).
// CoinGecko limita las peticiones por IP: se guarda en memoria del proceso 15 min.
export const URL_GLOBAL = 'https://api.coingecko.com/api/v3/global';

let memo = null;
export async function dominancia(fuente) {
  const ahora = fuente.ahora();
  if (!fuente.offline && memo && ahora - memo.t < 15 * 60e3) return memo.datos;
  const g = (await fuente.json(URL_GLOBAL, 'coingecko-global.json', { intentos: 1 }))?.data;
  if (!g?.market_cap_percentage) throw new Error('CoinGecko no respondió');
  const p = g.market_cap_percentage;
  const r = (x) => (x == null ? null : +(+x).toFixed(2));
  const datos = {
    ahora, btc_pct: r(p.btc), eth_pct: r(p.eth), usdt_pct: r(p.usdt), usdc_pct: r(p.usdc),
    estables_pct: r((+p.usdt || 0) + (+p.usdc || 0)),
    capitalizacion_usd: Math.round(+g.total_market_cap?.usd || 0) || null,
    cambio_cap_24h_pct: r(g.market_cap_change_percentage_24h_usd),
  };
  // lectura: capitalización total cayendo con las estables ganando peso = salida a refugio
  datos.lectura = datos.cambio_cap_24h_pct == null ? null
    : datos.cambio_cap_24h_pct <= -2 ? `El mercado cripto pierde ${Math.abs(datos.cambio_cap_24h_pct)} % en 24 h: el dinero sale a refugio (las stablecoins pesan ${datos.estables_pct} %).`
      : datos.cambio_cap_24h_pct >= 2 ? `El mercado cripto gana ${datos.cambio_cap_24h_pct} % en 24 h: entra dinero.`
        : `Capitalización total ${datos.cambio_cap_24h_pct >= 0 ? '+' : ''}${datos.cambio_cap_24h_pct} % en 24 h: sin un flujo claro.`;
  if (!fuente.offline) memo = { t: ahora, datos };
  return datos;
}
