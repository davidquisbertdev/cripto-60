// Confluencias de la entrada: Fibonacci, CVD + open interest y mapa de calor de liquidaciones.
// Afinan la confianza (±8 como mucho entre las tres) y la entrada; nunca deciden solas.
import { useState } from 'react';
import { Info } from 'lucide-react';
import { Panel, Filas } from './ui';
import { LineaSerie } from './graficos';
import { conSigno, hora, millones, pct, pctSigno, precio as fp } from '../lib/formato';
import type { FibMarco, FlujoCVD, Lado, MapaLiq, Senal } from '../lib/tipos';

const tonoV = (v: number) => (v > 0 ? 'gain' : v < 0 ? 'loss' : '');

export function PanelConfluencias({ s }: { s: Senal }) {
  const c = s.confluencias;
  if (!c?.items.length && !s.entrada.limit_fib) return null;
  return (
    <Panel titulo="Confluencias de la entrada" aside={c ? <span className={`tag ${c.ajuste > 0 ? 'tag-gain' : c.ajuste < 0 ? 'tag-loss' : ''} num`}>{conSigno(c.ajuste, 0) || '0'} confianza</span> : null} className="ord-5">
      <div style={{ display: 'grid', gap: 12 }}>
        {c?.items.length ? <ul className="list">{c.items.map((x) => <li key={x.texto}><Info size={14} aria-hidden className={tonoV(x.ajuste)} /><span>{x.texto}</span></li>)}</ul> : null}
        {s.entrada.limit_fib && (
          <Filas items={[{ k: `Entrada paciente (Fibonacci ${s.entrada.limit_fib.nivel} de ${s.entrada.limit_fib.marco})`, v: `limit ${fp(s.entrada.limit_fib.precio, s.decimales)}` }]} />
        )}
        <p className="faint" style={{ fontSize: 12 }}>Fibonacci, CVD con open interest y liquidaciones suman o restan como mucho 8 puntos de confianza entre las tres. El historial real sigue mandando.</p>
      </div>
    </Panel>
  );
}

export function PanelFlujo({ f, dec }: { f: FlujoCVD; dec: number }) {
  const [ver, setVer] = useState<'cvd' | 'oi' | 'precio'>('cvd');
  const serie = f.serie.filter((x) => ver !== 'oi' || x.oi != null).map((x) => ({ t: x.t, v: ver === 'cvd' ? x.cvd : ver === 'oi' ? x.oi! : x.c }));
  const ult = f.serie[f.serie.length - 1];
  const fmtV = ver === 'precio' ? (v: number) => fp(v, dec) : (v: number) => millones(ver === 'oi' && ult?.oi ? v * ult.c : v);
  const regTono = f.sesgo > 0 ? 'tag-gain' : f.sesgo < 0 ? 'tag-loss' : '';
  return (
    <Panel titulo="CVD y open interest" aside={<span className={`tag ${regTono}`}>{f.regimen}</span>} className="ord-5">
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="seg" role="group" aria-label="Serie del gráfico" style={{ justifySelf: 'start' }}>
          {(['cvd', 'oi', 'precio'] as const).map((k) => <button key={k} type="button" aria-pressed={ver === k} onClick={() => setVer(k)}>{k === 'cvd' ? 'CVD' : k === 'oi' ? 'Open interest' : 'Precio'}</button>)}
        </div>
        <LineaSerie puntos={serie} fmtV={fmtV} fmtT={(t) => hora(t)} etiqueta={`${ver === 'cvd' ? 'CVD acumulado' : ver === 'oi' ? 'Open interest' : 'Precio'} de las últimas 8 h`} tono={ver === 'cvd' ? ((ult?.cvd ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)') : 'var(--accent)'} alto={150} />
        <Filas items={[
          { k: `Precio · OI (${f.ventana_min} min)`, v: `${pctSigno(f.precio_pct)} · ${pctSigno(f.oi_pct)}`, cls: tonoV(f.precio_pct ?? 0) },
          { k: `CVD (${f.ventana_min} min)`, v: `${millones(f.cvd_usd)} USD · ${conSigno(f.fuerza_cvd * 100, 0)} % del volumen`, cls: tonoV(f.cvd_usd) },
          { k: 'OI · CVD en 24 h', v: `${pctSigno(f.oi_24h_pct)} · ${millones(f.cvd_24h_usd)} USD` },
        ]} />
        <p className="muted" style={{ fontSize: 13 }}>{f.frase}</p>
        {f.divergencia && <p className={`${f.divergencia.tipo === 'alcista' ? 'gain' : 'loss'}`} style={{ fontSize: 13 }}>{f.divergencia.frase}</p>}
        <p className="faint" style={{ fontSize: 12 }}>CVD = compras agresivas menos ventas agresivas (a mercado), acumulado. OI = contratos abiertos: sube si entra dinero nuevo. Datos de {f.simbolo} en Binance Futures.</p>
      </div>
    </Panel>
  );
}

export function PanelFib({ fib, dec, precio }: { fib: Partial<Record<'5m' | '15m', FibMarco | null>>; dec: number; precio: number }) {
  const marcos = (['15m', '5m'] as const).filter((k) => fib[k]);
  const [m, setM] = useState<'5m' | '15m'>(marcos[0] ?? '15m');
  const f = fib[m] ?? fib[marcos[0]];
  if (!f) return null;
  const filas = [
    { r: 0, precio: f.hasta, que: '0 % (extremo)' },
    ...f.niveles.map((n) => ({ r: n.r, precio: n.precio, que: `${+(n.r * 100).toFixed(1)} %` })),
    { r: 1, precio: f.desde, que: '100 % (origen)' },
    ...f.extensiones.map((n) => ({ r: n.r, precio: n.precio, que: `ext. ${+(n.r * 100).toFixed(1)} %` })),
  ].sort((a, b) => b.precio - a.precio);
  const dorado = (r: number) => r === 0.5 || r === 0.618;
  return (
    <Panel titulo="Fibonacci" aside={<span className="tag">{f.estado}</span>} flush className="ord-5">
      <div className="panel-b" style={{ display: 'grid', gap: 10 }}>
        {marcos.length > 1 && (
          <div className="seg" role="group" aria-label="Marco" style={{ justifySelf: 'start' }}>
            {marcos.map((k) => <button key={k} type="button" aria-pressed={m === k} onClick={() => setM(k)}>{k}</button>)}
          </div>
        )}
        <p className="muted" style={{ fontSize: 13 }}>Impulso {f.direccion} de {f.marco}: {fp(f.desde, dec)} → {fp(f.hasta, dec)} ({pct(f.rango_pct, 2)}). El precio retrocedió el {pct(f.retroceso * 100, 0)}.</p>
      </div>
      <div className="table-wrap">
        <table className="t">
          <thead><tr><th scope="col">Nivel</th><th scope="col" className="r">Precio</th><th scope="col" className="r">Distancia</th></tr></thead>
          <tbody>
            {filas.map((x, i) => {
              const sig = filas[i + 1];
              const aqui = sig && precio <= x.precio && precio > sig.precio;
              return (
                <tr key={x.que} style={dorado(x.r) ? { background: 'var(--warn-soft)' } : undefined}>
                  <td>{x.que}{dorado(x.r) ? <span className="faint"> · zona dorada</span> : null}{aqui ? <div className="faint" style={{ fontSize: 12 }}>▼ precio actual {fp(precio, dec)}</div> : null}</td>
                  <td className="r num">{fp(x.precio, dec)}</td>
                  <td className="r num muted">{pctSigno((100 * (x.precio - precio)) / precio)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="faint panel-b" style={{ fontSize: 12 }}>En tendencia el precio suele corregir hasta el 50–61.8 % (zona dorada) y seguir; más allá del 78.6 % el impulso probablemente falló.</p>
    </Panel>
  );
}

// Mapa de calor: cada fila es un tramo de precio; cuanto más intensa, más liquidaciones esperadas ahí.
// Arriba del precio se liquidan shorts (empujan hacia arriba); abajo, longs.
export function MapaCalorLiq({ m, dec, lado, sl, tp1 }: { m: MapaLiq; dec: number; lado?: Lado; sl?: number; tp1?: number }) {
  const tramos = [...m.tramos].reverse(); // de arriba (precio alto) a abajo
  const total = (t: MapaLiq['tramos'][number]) => t.longs_usd + t.shorts_usd + t.real_longs_usd + t.real_shorts_usd;
  const max = Math.max(1, ...tramos.map(total));
  const W = 720, fila = 9, L = 70, R = 90, H = tramos.length * fila + 4;
  const lo = tramos[tramos.length - 1].precio, hi = tramos[0].precio;
  const y = (p: number) => 2 + ((hi - p) / (hi - lo || 1)) * (tramos.length - 1) * fila + fila / 2;
  const marca = (p: number | undefined, que: string, color: string) => (p == null || p < lo || p > hi ? null : (
    <g key={que}><line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke={color} strokeDasharray="5 4" strokeWidth={1.5} /><text className="axis-t" x={W - R + 6} y={y(p) + 4} fill={color}>{que} {fp(p, dec)}</text></g>
  ));
  return (
    <Panel titulo="Mapa de calor de liquidaciones" aside={<span className="faint" style={{ fontSize: 12 }}>±{m.rango_pct} %</span>} className="ord-5">
      <div style={{ display: 'grid', gap: 12 }}>
        <div className="chart">
          <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Liquidaciones estimadas: ${millones(m.arriba_3pct_usd)} USD de shorts hasta 3 % arriba y ${millones(m.abajo_3pct_usd)} USD de longs hasta 3 % abajo`}>
            {tramos.map((t, i) => {
              const v = total(t), k = v / max, real = t.real_longs_usd + t.real_shorts_usd;
              const arriba = t.precio > m.precio;
              return (
                <g key={i}>
                  <rect x={L} y={2 + i * fila} width={W - L - R} height={fila - 1} fill={arriba ? 'var(--loss)' : 'var(--gain)'} opacity={0.04} />
                  <rect x={L} y={2 + i * fila} width={Math.max(v ? 2 : 0, (W - L - R) * k)} height={fila - 1} fill={arriba ? 'var(--loss)' : 'var(--gain)'} opacity={0.25 + 0.75 * k}><title>{`${fp(t.precio, dec)}: ${millones(v)} USD de ${arriba ? 'shorts' : 'longs'}${real ? ` (${millones(real)} de ballenas reales)` : ''}`}</title></rect>
                  {real > 0 && <rect x={L} y={2 + i * fila + fila / 2 - 1.5} width={Math.max(4, ((W - L - R) * real) / max)} height={3} fill="var(--warn)" />}
                  {i % 4 === 0 && <text className="axis-t" x={L - 8} y={2 + i * fila + fila - 1} textAnchor="end">{fp(t.precio, dec)}</text>}
                </g>
              );
            })}
            {marca(m.precio, 'precio', 'var(--text)')}
            {marca(sl, 'SL', 'var(--loss)')}
            {marca(tp1, 'TP1', 'var(--gain)')}
          </svg>
        </div>
        <div className="prob-legend">
          <span><i className="sw" style={{ background: 'var(--loss)' }} aria-hidden />shorts por liquidar (arriba)</span>
          <span><i className="sw" style={{ background: 'var(--gain)' }} aria-hidden />longs por liquidar (abajo)</span>
          {m.reales > 0 && tramos.some((t) => t.real_longs_usd + t.real_shorts_usd > 0) && <span><i className="sw" style={{ background: 'var(--warn)' }} aria-hidden />ballenas reales ({m.reales})</span>}
        </div>
        <Filas items={[
          { k: 'Imán arriba', v: m.zona_arriba ? `${fp(m.zona_arriba.precio, dec)} · ${pctSigno(m.zona_arriba.dist_pct)} · ${millones(m.zona_arriba.usd)} USD` : '—' },
          { k: 'Imán abajo', v: m.zona_abajo ? `${fp(m.zona_abajo.precio, dec)} · ${pctSigno(m.zona_abajo.dist_pct)} · ${millones(m.zona_abajo.usd)} USD` : '—' },
          { k: 'Hasta 3 %: shorts arriba / longs abajo', v: `${millones(m.arriba_3pct_usd)} / ${millones(m.abajo_3pct_usd)}`, cls: m.asimetria >= 0.5 ? 'gain' : m.asimetria <= -0.5 ? 'loss' : '' },
          { k: 'Liquidados en la última hora (longs / shorts)', v: `${millones(m.barrida_1h.longs_usd)} / ${millones(m.barrida_1h.shorts_usd)}` },
        ]} />
        <p className="faint" style={{ fontSize: 12 }}>{m.estimado ? 'Estimado con el open interest de Binance de 24 h (posiciones nuevas a 10x–100x)' : 'Sin open interest: solo ballenas'}{m.reales ? ' más el precio de liquidación real de las ballenas de Hyperliquid' : ''}. El precio suele ir a barrer las zonas intensas y luego girarse: no pongas el SL{lado ? ` del ${lado}` : ''} dentro de una.</p>
      </div>
    </Panel>
  );
}
