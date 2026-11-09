// Formato de números, dinero y horas, en español y con la zona del usuario.
let zona: string | undefined;
export const fijarZona = (z: string | null | undefined) => { zona = z || undefined; };
export const zonaNavegador = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

// Punto decimal, como el exchange y el motor: los niveles se copian tal cual a la orden.
const nf = (d: number) => new Intl.NumberFormat('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
export const numero = (x: number | null | undefined, d = 2) => (x == null || !Number.isFinite(x) ? '—' : nf(d).format(x).replace(/\u00a0/g, ' '));
export const precio = (x: number | null | undefined, dec = 2) => numero(x, dec);
const decUsdt = (x: number) => (x !== 0 && Math.abs(x) < 1 ? 3 : 2);
export const usdt = (x: number | null | undefined, d?: number) => (x == null ? '—' : `${numero(x, d ?? decUsdt(x))} USDT`);
export const conSigno = (x: number | null | undefined, d = 2) => (x == null ? '—' : `${x > 0 ? '+' : x < 0 ? '−' : ''}${numero(Math.abs(x), d)}`);
export const usdtSigno = (x: number | null | undefined, d?: number) => (x == null ? '—' : `${conSigno(x, d ?? decUsdt(x))} USDT`);
export const pct = (x: number | null | undefined, d = 1) => (x == null ? '—' : `${numero(x, d)} %`);
export const pctSigno = (x: number | null | undefined, d = 2) => (x == null ? '—' : `${conSigno(x, d)} %`);
export const tono = (x: number | null | undefined) => (x == null || x === 0 ? '' : x > 0 ? 'gain' : 'loss');
export const millones = (x: number | null | undefined) => (x == null ? '—' : Math.abs(x) >= 1e6 ? `${numero(x / 1e6, 1)} M` : `${numero(x / 1e3, 0)} k`);

export const hora = (ms: number | null | undefined) =>
  ms == null ? '—' : new Intl.DateTimeFormat('es', { timeZone: zona, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
export const fechaHora = (ms: number | string | null | undefined) =>
  ms == null ? '—' : new Intl.DateTimeFormat('es', { timeZone: zona, day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
export const fechaCorta = (ms: number | string) => new Intl.DateTimeFormat('es', { timeZone: zona, day: 'numeric', month: 'short' }).format(new Date(ms));
export const diaClave = (ms: number | string) => new Intl.DateTimeFormat('en-CA', { timeZone: zona, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));

export function hace(ms: number, ahora = Date.now()) {
  const m = Math.round((ahora - ms) / 60e3);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m} min`;
  const h = Math.round(m / 60);
  return h < 48 ? `hace ${h} h` : `hace ${Math.round(h / 24)} días`;
}
export function cuenta(ms: number) {
  if (ms <= 0) return '0:00';
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}` : `${m}:${String(ss).padStart(2, '0')}`;
}
export const nombreExchange = (x: string | null | undefined) => ({ BINANCE: 'Binance', BYBIT: 'Bybit', MEXC: 'MEXC' } as Record<string, string>)[String(x ?? '').toUpperCase()] ?? String(x ?? '—');
export const estrategiaNombre = (e: string) => (e === 'reversion' ? 'Reversión a la media' : 'Tendencia');
