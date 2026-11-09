import { useMemo, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { cuenta, fechaHora, hora, numero, pct, precio as fp, usdt, usdtSigno } from '../lib/formato';
import { useAhora } from '../lib/usar';
import type { Lado } from '../lib/tipos';

// Reloj de la operación: cada hora límite con su cuenta regresiva.
export function Reloj({ desde, hitos }: { desde: number; hitos: { que: string; a: number | null }[] }) {
  const ahora = useAhora();
  return (
    <div className="clock">
      {hitos.filter((h) => h.a).map((h) => {
        const resta = h.a! - ahora, total = h.a! - desde;
        const estado = resta <= 0 ? 'past' : resta < 3 * 60e3 ? 'soon' : '';
        const avance = total > 0 ? Math.min(100, Math.max(0, 100 * (1 - resta / total))) : 100;
        return (
          <div className={`clock-row ${estado}`} key={h.que}>
            <span className="what">{h.que}</span>
            <span className="at num">{resta <= 0 ? `pasó a las ${hora(h.a)}` : `a las ${hora(h.a)}`}</span>
            <span className="left num" aria-live={estado === 'soon' ? 'polite' : undefined}>{resta <= 0 ? 'Cumplido' : cuenta(resta)}</span>
            <span />
            <span className="meter" aria-hidden><i style={{ width: `${avance}%` }} /></span>
          </div>
        );
      })}
    </div>
  );
}

// Barra de probabilidades: segmentos con separación de 2 px y etiquetas directas (el color nunca va solo).
export function BarraProb({ partes }: { partes: { que: string; v: number; color: string }[] }) {
  const total = partes.reduce((s, p) => s + p.v, 0) || 1;
  return (
    <div className="prob">
      <div className="prob-bar" role="img" aria-label={partes.map((p) => `${p.que} ${pct(p.v, 0)}`).join(', ')}>
        {partes.map((p) => <i key={p.que} style={{ width: `${(100 * p.v) / total}%`, background: p.color }} title={`${p.que}: ${pct(p.v)}`} />)}
      </div>
      <div className="prob-legend">
        {partes.map((p) => <span key={p.que}><i className="sw" style={{ background: p.color }} aria-hidden />{p.que} <b className="num">{pct(p.v, 0)}</b></span>)}
      </div>
    </div>
  );
}

// Escalera de precios: SL, entrada, TPs y precio actual en su posición real.
export function Escalera({ lado, entrada, sl, tps, actual, dec, tocados = 0, liquidacion }: { lado: Lado; entrada: number; sl: number; tps: number[]; actual?: number; dec: number; tocados?: number; liquidacion?: number | null }) {
  const marcas = [
    { k: 'SL', p: sl, cls: 'loss' },
    { k: 'Entrada', p: entrada, cls: '' },
    ...tps.map((p, i) => ({ k: `TP${i + 1}`, p, cls: i < tocados ? 'gain hit' : 'gain' })),
  ];
  const todos = [...marcas.map((m) => m.p), ...(actual != null ? [actual] : [])];
  const min = Math.min(...todos), max = Math.max(...todos), pad = (max - min) * 0.08 || 1;
  const y = (p: number) => 100 - (100 * (p - (min - pad))) / (max - min + 2 * pad);
  const zona = (a: number, b: number, color: string) => <div className="ladder-zone" style={{ top: `${Math.min(y(a), y(b))}%`, height: `${Math.abs(y(a) - y(b))}%`, background: color }} />;
  return (
    <div className="ladder" role="img" aria-label={`${lado}: ${marcas.map((m) => `${m.k} ${fp(m.p, dec)}`).join(', ')}${actual != null ? `, precio actual ${fp(actual, dec)}` : ''}`}>
      <div className="ladder-axis" />
      {zona(entrada, sl, 'var(--loss-soft)')}
      {zona(entrada, tps[tps.length - 1], 'var(--gain-soft)')}
      {marcas.map((m) => (
        <div key={m.k} className="ladder-mark" style={{ top: `${y(m.p)}%` }}>
          <span className="l">{m.k}</span><span className="tick" />
          <span className={`r num ${m.cls.includes('loss') ? 'loss' : m.cls.includes('gain') ? 'gain' : ''}`}>
            {fp(m.p, dec)}{m.cls.includes('hit') && <Check size={13} aria-label="tocado" style={{ marginLeft: 4, verticalAlign: -2 }} />}
          </span>
        </div>
      ))}
      {actual != null && <div className="ladder-now" style={{ top: `${y(actual)}%` }}><span className="num">Ahora {fp(actual, dec)}</span></div>}
      {liquidacion != null && <div className="faint num" style={{ position: 'absolute', bottom: -22, left: 0, right: 0, textAlign: 'center', fontSize: 12 }}>Liquidación {fp(liquidacion, dec)}</div>}
    </div>
  );
}

// Curva de capital: una serie, eje Y del capital, línea base en el capital inicial, cruz y tooltip al pasar.
export function CurvaCapital({ puntos, inicial }: { puntos: { t: number; capital: number; pnl: number; simbolo: string }[]; inicial: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [hov, setHov] = useState<number | null>(null);
  const W = 720, H = 220, L = 52, R = 12, T = 12, B = 26;
  const datos = useMemo(() => [{ t: puntos[0]?.t ?? Date.now(), capital: inicial, pnl: 0, simbolo: 'Inicio' }, ...puntos], [puntos, inicial]);
  const vals = datos.map((d) => d.capital);
  const lo = Math.min(...vals, inicial), hi = Math.max(...vals, inicial), span = hi - lo || 1;
  const yMin = lo - span * 0.12, yMax = hi + span * 0.12;
  const x = (i: number) => L + ((W - L - R) * i) / Math.max(1, datos.length - 1);
  const y = (v: number) => T + ((H - T - B) * (yMax - v)) / (yMax - yMin);
  const linea = datos.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.capital).toFixed(1)}`).join('');
  const area = `${linea}L${x(datos.length - 1)},${H - B}L${x(0)},${H - B}Z`;
  const ticks = [0, 1, 2, 3].map((k) => yMin + ((yMax - yMin) * k) / 3);
  const mover = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - L) / (W - L - R)) * (datos.length - 1));
    setHov(Math.max(0, Math.min(datos.length - 1, i)));
  };
  const h = hov != null ? datos[hov] : null;
  return (
    <div className="chart" ref={ref} onPointerMove={mover} onPointerLeave={() => setHov(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Capital de ${usdt(inicial)} a ${usdt(vals[vals.length - 1])} en ${puntos.length} operaciones`}>
        {ticks.map((v) => (
          <g key={v}><line className="grid-l" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="axis-t" x={L - 8} y={y(v) + 4} textAnchor="end">{numero(v, 1)}</text></g>
        ))}
        <line className="base" x1={L} x2={W - R} y1={y(inicial)} y2={y(inicial)} />
        <path className="area" d={area} />
        <path className="line" d={linea} />
        <text className="axis-t" x={L} y={H - 6}>{fechaHora(datos[0].t)}</text>
        <text className="axis-t" x={W - R} y={H - 6} textAnchor="end">{fechaHora(datos[datos.length - 1].t)}</text>
        {h && hov != null && (<g><line className="cross" x1={x(hov)} x2={x(hov)} y1={T} y2={H - B} /><circle className="dot" cx={x(hov)} cy={y(h.capital)} r={5} /></g>)}
      </svg>
      {h && hov != null && (
        <div className="tip" style={{ left: `${(100 * x(hov)) / W}%`, top: `${(100 * y(h.capital)) / H}%` }}>
          <div className="k">{hov === 0 ? 'Capital inicial' : `${h.simbolo} · ${fechaHora(h.t)}`}</div>
          <div className="num"><b>{usdt(h.capital, 2)}</b>{hov > 0 && <span className={h.pnl >= 0 ? 'gain' : 'loss'}> {usdtSigno(h.pnl)}</span>}</div>
        </div>
      )}
    </div>
  );
}

// Medidor de dirección de -1 (bajista) a +1 (alcista).
export function MedidorDir({ v, etiqueta }: { v: number; etiqueta?: string }) {
  const c = Math.max(-1, Math.min(1, v));
  return (
    <div>
      <div className="meter-dir" role="meter" aria-valuemin={-1} aria-valuemax={1} aria-valuenow={+c.toFixed(2)} aria-label={etiqueta ?? 'Dirección'}>
        <span className="mid" />
        <span className="pin" style={{ left: `${50 + c * 50}%`, background: c > 0.15 ? 'var(--gain)' : c < -0.15 ? 'var(--loss)' : 'var(--neutral-mark)' }} />
      </div>
      <div className="meter-scale"><span>Bajista</span><span>Neutral</span><span>Alcista</span></div>
    </div>
  );
}

export const COL = { gain: 'var(--gain)', loss: 'var(--loss)', neutro: 'var(--neutral-mark)', warn: 'var(--warn)' };

// Línea de una serie con cruz y tooltip al pasar (Fear & Greed de 30 días, BTC de 24 h).
// dominio fijo opcional (p. ej. 0-100) y líneas de referencia con su etiqueta.
export function LineaSerie({ puntos, fmtV, fmtT, etiqueta, dominio, refs = [], tono = 'var(--accent)', alto = 180 }: {
  puntos: { t: number; v: number }[]; fmtV: (v: number) => string; fmtT: (t: number) => string; etiqueta: string;
  dominio?: [number, number]; refs?: { v: number; que: string }[]; tono?: string; alto?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hov, setHov] = useState<number | null>(null);
  const W = 720, H = alto, L = 52, R = 12, T = 10, B = 24;
  if (puntos.length < 2) return <p className="muted">Sin datos suficientes.</p>;
  const vals = puntos.map((p) => p.v);
  const lo0 = Math.min(...vals), hi0 = Math.max(...vals), span = hi0 - lo0 || Math.abs(hi0) * 0.01 || 1;
  const [yMin, yMax] = dominio ?? [lo0 - span * 0.12, hi0 + span * 0.12];
  const x = (i: number) => L + ((W - L - R) * i) / (puntos.length - 1);
  const y = (v: number) => T + ((H - T - B) * (yMax - v)) / (yMax - yMin);
  const linea = puntos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join('');
  const area = `${linea}L${x(puntos.length - 1)},${H - B}L${x(0)},${H - B}Z`;
  const ticks = dominio ? [] : [0, 1, 2, 3].map((k) => yMin + ((yMax - yMin) * k) / 3);
  const mover = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    setHov(Math.max(0, Math.min(puntos.length - 1, Math.round(((px - L) / (W - L - R)) * (puntos.length - 1)))));
  };
  const h = hov != null ? puntos[hov] : null;
  return (
    <div className="chart" ref={ref} onPointerMove={mover} onPointerLeave={() => setHov(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${etiqueta}: de ${fmtV(vals[0])} a ${fmtV(vals[vals.length - 1])}`} style={{ ['--serie' as string]: tono }}>
        {ticks.map((v) => (
          <g key={v}><line className="grid-l" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="axis-t" x={L - 8} y={y(v) + 4} textAnchor="end">{fmtV(v)}</text></g>
        ))}
        {refs.map((r) => (
          <g key={r.v}><line className="grid-l" strokeDasharray="4 4" x1={L} x2={W - R} y1={y(r.v)} y2={y(r.v)} /><text className="axis-t" x={L - 8} y={y(r.v) + 4} textAnchor="end">{r.v}</text><text className="axis-t" x={W - R - 4} y={y(r.v) - 5} textAnchor="end">{r.que}</text></g>
        ))}
        <path className="area serie" d={area} />
        <path className="line serie" d={linea} />
        <text className="axis-t" x={L} y={H - 6}>{fmtT(puntos[0].t)}</text>
        <text className="axis-t" x={W - R} y={H - 6} textAnchor="end">{fmtT(puntos[puntos.length - 1].t)}</text>
        {h && hov != null && (<g><line className="cross" x1={x(hov)} x2={x(hov)} y1={T} y2={H - B} /><circle className="dot serie" cx={x(hov)} cy={y(h.v)} r={5} /></g>)}
      </svg>
      {h && hov != null && (
        <div className="tip" style={{ left: `${(100 * x(hov)) / W}%`, top: `${(100 * y(h.v)) / H}%` }}>
          <div className="k">{fmtT(h.t)}</div>
          <div className="num"><b>{fmtV(h.v)}</b></div>
        </div>
      )}
    </div>
  );
}

// Fear & Greed de hoy en una escala de 0 a 100 con sus cinco zonas.
const ZONAS_FNG = [[0, 25, 'Miedo extremo'], [25, 45, 'Miedo'], [45, 55, 'Neutral'], [55, 75, 'Codicia'], [75, 101, 'Codicia extrema']] as const;
export function zonaFNG(v: number) { return ZONAS_FNG.find(([a, b]) => v >= a && v < b)?.[2] ?? ''; }
export function MedidorFNG({ valor, clase, ayer, semana }: { valor: number; clase: string; ayer?: number | null; semana?: number | null }) {
  const tono = valor < 45 ? 'loss' : valor > 55 ? 'gain' : '';
  const dif = (a?: number | null) => (a == null ? '—' : `${a} (${valor - a >= 0 ? '+' : '−'}${Math.abs(valor - a)})`);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        <span className={`num ${tono}`} style={{ fontSize: 40, fontWeight: 750, lineHeight: 1 }}>{valor}</span>
        <span style={{ fontWeight: 600 }}>{clase}</span>
      </div>
      <div className="fng-scale" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={valor} aria-label={`Fear & Greed ${valor}, ${clase}`}>
        {ZONAS_FNG.map(([a, b, q]) => <i key={q} className={`z z-${a}`} style={{ width: `${Math.min(b, 100) - a}%` }} title={`${q}: ${a}–${Math.min(b, 100)}`} />)}
        <span className="pin" style={{ left: `${valor}%` }} />
      </div>
      <div className="meter-scale"><span>Miedo extremo</span><span>Neutral</span><span>Codicia extrema</span></div>
      <div className="muted num" style={{ fontSize: 13 }}>Ayer {dif(ayer)} · hace una semana {dif(semana)}</div>
    </div>
  );
}

// Histograma de barras con signo (rojo a la izquierda del 0, verde a la derecha) y tooltip al pasar.
export function Histograma({ barras, etiqueta, unidad = 'monedas' }: { barras: { tramo: string; n: number; positivo: boolean }[]; etiqueta: string; unidad?: string }) {
  const [hov, setHov] = useState<number | null>(null);
  const max = Math.max(1, ...barras.map((b) => b.n));
  return (
    <div className="hist" role="img" aria-label={`${etiqueta}: ${barras.map((b) => `${b.tramo} ${b.n}`).join(', ')}`}>
      <div className="hist-bars" onPointerLeave={() => setHov(null)}>
        {barras.map((b, i) => (
          <div key={b.tramo} className="hist-col" onPointerEnter={() => setHov(i)}>
            {hov === i && <div className="tip hist-tip"><div className="k">{b.tramo}</div><div className="num"><b>{b.n}</b> {unidad}</div></div>}
            <span className="hist-n num">{b.n || ''}</span>
            <i style={{ height: `${(100 * b.n) / max}%`, background: b.positivo ? 'var(--gain)' : 'var(--loss)' }} />
          </div>
        ))}
      </div>
      <div className="hist-x">{barras.map((b) => <span key={b.tramo}>{b.tramo.replace(' a ', '…')}</span>)}</div>
    </div>
  );
}
