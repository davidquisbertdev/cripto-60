// Formato de salida y lectura de argumentos de línea de comandos.

export function args(argv, { flags = [], numeros = [] } = {}) {
  const pos = [], op = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k0, v0] = a.slice(2).split('=');
      const k = k0.replace(/-/g, '_');
      if (flags.includes(k)) { op[k] = true; continue; }
      const v = v0 ?? argv[++i];
      if (v === undefined) throw new Error(`Falta el valor de --${k0}`);
      op[k] = numeros.includes(k) ? numero(v, `--${k0}`) : v;
    } else pos.push(a);
  }
  return { pos, op };
}

export function numero(v, que) {
  const n = Number(String(v).replace(',', '.').replace(/[$\s]|usdt/gi, ''));
  if (!Number.isFinite(n)) throw new Error(`${que} debe ser un número (recibí "${v}")`);
  return n;
}

export const precio = (x, dec) => (x == null ? '—' : (+x).toFixed(dec));
export const usdt = (x) => (x == null ? '—' : `${x >= 0 ? '' : '-'}${Math.abs(x).toFixed(Math.abs(x) < 1 ? 3 : 2)} USDT`);
export const pct = (x, d = 1) => (x == null ? '—' : `${(+x).toFixed(d)} %`);
export const signo = (x, d = 2) => (x == null ? '—' : `${x >= 0 ? '+' : ''}${(+x).toFixed(d)}`);

export function hora(ms, tz) {
  return new Intl.DateTimeFormat('es', { timeZone: tz || undefined, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

export function duracion(min) {
  if (min == null) return '—';
  min = Math.round(min);
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

// "5m", "90", "1h30m", "2h" -> minutos
export function parseDuracion(s) {
  const t = String(s).trim().toLowerCase();
  if (/^\d+(\.\d+)?$/.test(t)) return +t;
  const m = t.match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?:in)?)?$/);
  if (!m || (!m[1] && !m[2])) throw new Error(`Duración no válida: "${s}" (usa 5m, 45m, 2h, 1h30m)`);
  return (+(m[1] || 0)) * 60 + +(m[2] || 0);
}

// "2026-11-07 10:30" (hora local del sistema) o ISO -> ms
export function parseFecha(s) {
  const t = Date.parse(String(s).trim().replace(' ', 'T'));
  if (!Number.isFinite(t)) throw new Error(`Fecha no válida: "${s}" (usa "2026-11-07 10:30")`);
  return t;
}

export function salir(e) {
  console.error(`Error: ${e.message}`);
  if (process.env.DEBUG) console.error(e.stack);
  process.exit(1);
}
