// PREDICCIÓN de MEXC (Up/Down de 5 y 15 min en BTC y ETH): las cajas con su reloj (5 anteriores, la actual
// y las próximas), el detalle de la que se pulse y, al pedir el análisis, el veredicto final (UP, DOWN o NO OPERAR).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleSlash, Clock, RefreshCw, Sparkles, Timer } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { ErrorEstado, Esqueleto, Filas, KV, Nota, Panel, Vacio } from '../components/ui';
import { backend } from '../lib/api';
import { useAhora, useLocal, usePeticion } from '../lib/usar';
import { conSigno, cuenta, hora, numero, pct, pctSigno, precio as fp } from '../lib/formato';
import type { AnalisisPred, CajaPred, LadoPred, ListaPred } from '../lib/tipos';

const MONEDAS = ['BTC', 'ETH'] as const;
const PLAZOS = [5, 15] as const;
const tramo = (c: { inicio: number; fin: number }) => `${hora(c.inicio)} – ${hora(c.fin)}`;

function LadoPredTag({ lado }: { lado: LadoPred | 'NO OPERAR' }) {
  if (lado === 'NO OPERAR') return <span className="tag"><CircleSlash size={12} aria-hidden />NO OPERAR</span>;
  return lado === 'UP'
    ? <span className="tag tag-gain"><ArrowUpRight size={14} aria-hidden />UP</span>
    : <span className="tag tag-loss"><ArrowDownRight size={14} aria-hidden />DOWN</span>;
}

// Barra Up/Down con el porcentaje de cada lado
function BarraLados({ up, etiqueta }: { up: number; etiqueta: string }) {
  const u = Math.max(0, Math.min(100, up));
  return (
    <div className="pred-barra" role="img" aria-label={`${etiqueta}: Up ${numero(u, 0)} %, Down ${numero(100 - u, 0)} %`}>
      <span className="num gain">Up {numero(u, 0)} %</span>
      <div className="pred-barra-pista"><i style={{ width: `${u}%` }} /></div>
      <span className="num loss">Down {numero(100 - u, 0)} %</span>
    </div>
  );
}

function Caja({ c, ahora, elegida, onElegir }: { c: CajaPred; ahora: number; elegida: boolean; onElegir: () => void }) {
  const terminada = c.estado === 'actual' && ahora >= c.fin;
  return (
    <button type="button" className={`pred-caja pred-${c.estado}`} aria-pressed={elegida} onClick={onElegir}>
      <span className="pred-caja-h num">{tramo(c)}</span>
      {c.estado === 'cerrada' && (
        <>
          {c.resultado ? <LadoPredTag lado={c.resultado} /> : <span className="tag">Sin dato</span>}
          <span className={`num ${c.resultado === 'UP' ? 'gain' : c.resultado === 'DOWN' ? 'loss' : ''}`}>{pctSigno(c.cambio_pct, 3)}</span>
          <span className="faint num pred-caja-s">{fp(c.base, 2)} → {fp(c.cierre, 2)}</span>
        </>
      )}
      {c.estado === 'actual' && (
        <>
          <span className="tag tag-accent"><Timer size={12} aria-hidden />{terminada ? 'Cerró' : `Cierra en ${cuenta(c.fin - ahora)}`}</span>
          <span className="num">Base {fp(c.base, 2)}</span>
          <span className="faint num pred-caja-s">{c.p_up == null ? 'Sin lectura rápida' : `Modelo: Up ${c.p_up} %`}{c.mercado?.up?.venta ? ` · MEXC ${numero(100 * c.mercado.up.venta, 0)} %` : ''}</span>
        </>
      )}
      {c.estado === 'proxima' && (
        <>
          <span className="tag"><Clock size={12} aria-hidden />Abre en {cuenta(c.inicio - ahora)}</span>
          <span className="num faint">{c.base_estimada ? `Base ≈ ${fp(c.base_estimada, 2)}` : 'Base por fijar'}</span>
          <span className="faint pred-caja-s">Se fija al abrir</span>
        </>
      )}
    </button>
  );
}

// Índice de MEXC (lo que liquida) y spot en vivo, con la base y el cierre proyectado
function GraficoCaja({ a }: { a: AnalisisPred }) {
  const W = 720, H = 230, L = 62, R = 16, T = 12, B = 24;
  const g = useMemo(() => {
    const s = a.serie;
    if (s.length < 2) return null;
    const base = a.caja.base ?? a.caja.base_estimada ?? null, pr = a.proyeccion;
    const t0 = s[0].t, t1 = Math.max(s[s.length - 1].t, a.caja.estado === 'actual' ? a.caja.fin : s[s.length - 1].t);
    const vals = s.flatMap((x) => (x.spot != null ? [x.indice, x.spot] : [x.indice]));
    if (base != null) vals.push(base);
    if (pr && a.caja.estado === 'actual') vals.push(pr.cierre_esperado + pr.margen, pr.cierre_esperado - pr.margen);
    let lo = Math.min(...vals), hi = Math.max(...vals);
    const pad = (hi - lo || hi * 1e-4) * 0.1; lo -= pad; hi += pad;
    const x = (t: number) => L + ((t - t0) / (t1 - t0 || 1)) * (W - L - R), y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
    const linea = (k: 'indice' | 'spot') => s.filter((p) => p[k] != null).map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p[k] as number).toFixed(1)}`).join('');
    return { base, pr, t0, t1, lo, hi, x, y, indice: linea('indice'), spot: s.some((p) => p.spot != null) ? linea('spot') : null };
  }, [a]);
  if (!g) return null;
  const { base, pr, x, y, lo, hi } = g;
  const marcasY = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  return (
    <div className="chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Índice de MEXC y spot en vivo de ${a.moneda} frente al precio base de la caja`}>
        {marcasY.map((v) => <g key={v}><line className="grid-l" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text x={L - 6} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)">{fp(v, 2)}</text></g>)}
        {a.caja.inicio >= g.t0 && <line x1={x(a.caja.inicio)} x2={x(a.caja.inicio)} y1={T} y2={H - B} stroke="var(--line-2)" strokeDasharray="3 3" />}
        {a.caja.estado === 'actual' && <line x1={x(a.caja.fin)} x2={x(a.caja.fin)} y1={T} y2={H - B} stroke="var(--line-2)" strokeDasharray="3 3" />}
        {base != null && <><line x1={L} x2={W - R} y1={y(base)} y2={y(base)} stroke="var(--warn-text)" strokeWidth="1.2" strokeDasharray="6 4" /><text x={W - R} y={y(base) - 5} textAnchor="end" fontSize="11" fill="var(--warn-text)">Base {fp(base, 2)}</text></>}
        {g.spot && <path d={g.spot} fill="none" stroke="var(--text-3)" strokeWidth="1.2" />}
        <path d={g.indice} fill="none" stroke="var(--accent)" strokeWidth="2" />
        {pr && a.caja.estado === 'actual' && (
          <g>
            <line x1={x(a.caja.fin)} x2={x(a.caja.fin)} y1={y(pr.cierre_esperado + pr.margen)} y2={y(pr.cierre_esperado - pr.margen)} stroke={pr.p_up >= 50 ? 'var(--gain-text)' : 'var(--loss-text)'} strokeWidth="3" strokeLinecap="round" />
            <circle cx={x(a.caja.fin)} cy={y(pr.cierre_esperado)} r="4.5" fill={pr.p_up >= 50 ? 'var(--gain-text)' : 'var(--loss-text)'} />
          </g>
        )}
        <text x={x(g.t0)} y={H - 6} fontSize="11" fill="var(--text-3)">{hora(g.t0)}</text>
        <text x={x(g.t1)} y={H - 6} textAnchor="end" fontSize="11" fill="var(--text-3)">{hora(g.t1)}</text>
      </svg>
      <div className="pred-leyenda faint">
        <span><i style={{ background: 'var(--accent)' }} />Índice de MEXC (media de 60 s, el que liquida)</span>
        {g.spot && <span><i style={{ background: 'var(--text-3)' }} />Spot en vivo (Binance, ajustado a USD)</span>}
        {pr && a.caja.estado === 'actual' && <span><i style={{ background: pr.p_up >= 50 ? 'var(--gain-text)' : 'var(--loss-text)' }} />Cierre proyectado ± margen</span>}
      </div>
    </div>
  );
}

function Veredicto({ a, ahora }: { a: AnalisisPred; ahora: number }) {
  const v = a.veredicto!, pr = a.proyeccion!, viejo = ahora - a.ahora > 20e3;
  const cls = v === 'UP' ? 'gain' : v === 'DOWN' ? 'loss' : '';
  return (
    <>
      <div className="action">
        <div className="faint" style={{ fontSize: 'var(--fs-xs)' }}>VEREDICTO · {a.moneda} {a.plazo} min · {tramo(a.caja)}</div>
        <div className={`action-word ${cls}`}>{v}</div>
        <p>{a.razones?.[0]}</p>
        {v !== 'NO OPERAR' && <div><span className={`tag ${a.nivel === 'BAJA' ? 'tag-warn' : ''}`}>Confianza {a.nivel?.toLowerCase()}</span></div>}
      </div>
      <div className="panel-b" style={{ display: 'grid', gap: 'var(--sp-4)' }}>
        {viejo && a.caja.estado === 'actual' && <Nota tono="warn">Este análisis tiene {Math.round((ahora - a.ahora) / 1000)} s. En estas cajas todo cambia en segundos: vuelve a analizar antes de entrar.</Nota>}
        <BarraLados up={pr.p_up} etiqueta="Probabilidad del modelo" />
        {a.razones?.slice(1).map((r) => <p key={r} className="muted" style={{ margin: 0 }}>{r}</p>)}
        {a.avisos?.map((x) => <Nota key={x} tono="warn">{x}</Nota>)}
      </div>
      <KV items={[
        { k: a.caja.estado === 'actual' ? 'Precio base' : 'Base estimada', v: fp(a.caja.base ?? a.caja.base_estimada, 2), s: a.caja.estado === 'actual' ? 'To Beat en MEXC' : 'se fija al abrir' },
        { k: 'Índice de MEXC ahora', v: fp(a.indice, 2), s: a.caja.base != null ? `${conSigno(a.indice! - a.caja.base, 2)} sobre la base` : undefined, cls: a.caja.base != null ? (a.indice! > a.caja.base ? 'gain' : 'loss') : '' },
        { k: 'Spot en vivo (USD)', v: fp(a.spot, 2), s: `${conSigno(a.spot! - a.indice!, 2)} frente al índice` },
        { k: 'Cierre proyectado', v: fp(pr.cierre_esperado, 2), s: pr.decidido ? 'ya decidido' : `± ${fp(pr.margen, 2)}`, cls: pr.distancia > 0 ? 'gain' : 'loss' },
        { k: 'Precio en MEXC', v: a.precio_mercado != null ? numero(a.precio_mercado, 2) : '—', s: a.lado_probable ? `por acción de ${a.lado_probable}` : undefined },
        { k: 'Paga como máximo', v: numero(a.precio_maximo, 2), s: a.valor_esperado_pct != null ? `valor esperado ${pctSigno(a.valor_esperado_pct, 1)}` : 'por acción' },
      ]} />
    </>
  );
}

function DetalleCerrada({ a }: { a: AnalisisPred }) {
  const c = a.caja, r = a.recorrido;
  return (
    <>
      <div className="action">
        <div className="faint" style={{ fontSize: 'var(--fs-xs)' }}>CÓMO TERMINÓ · {a.moneda} {a.plazo} min · {tramo(c)}</div>
        <div className={`action-word ${c.resultado === 'UP' ? 'gain' : 'loss'}`}>{c.resultado}</div>
        <p>Cerró en {fp(c.cierre, 2)} frente a una base de {fp(c.base, 2)}: {conSigno(c.cambio, 2)} ({pctSigno(c.cambio_pct, 3)}).</p>
      </div>
      {r && <KV items={[
        { k: 'Máximo', v: fp(r.max, 2) }, { k: 'Mínimo', v: fp(r.min, 2) },
        { k: 'Tiempo sobre la base', v: pct(r.sobre_base_pct, 0) },
        { k: 'Cruces de la base', v: String(r.cruces), s: r.cruces ? `el último a los ${cuenta(r.ultimo_cruce_s * 1000)}` : 'nunca la cruzó' },
        { k: 'Volumen apostado', v: c.volumen != null ? `${numero(c.volumen, 0)} USDT` : '—' },
      ]} />}
    </>
  );
}

export function Prediccion() {
  const [moneda, setMoneda] = useLocal<string>('cripto60-pred-moneda', 'BTC');
  const [plazo, setPlazo] = useLocal<number>('cripto60-pred-plazo', 5);
  const ahora = useAhora();
  const lista = usePeticion(() => backend.motor<ListaPred>('prediccion', { moneda, plazo }), [moneda, plazo], { clave: `pred:${moneda}:${plazo}` });
  const l = lista.datos && lista.datos.plazo === plazo && (lista.datos.moneda === moneda || lista.datos.demo_nota) ? lista.datos : null;
  const [sel, setSel] = useState<number | null>(null);
  const [an, setAn] = useState<{ clave: string; datos: AnalisisPred } | null>(null);
  const [cargandoA, setCargandoA] = useState(false);
  const [errorA, setErrorA] = useState<string | null>(null);
  const turno = useRef(0);

  const actual = l?.cajas.find((c) => c.estado === 'actual') ?? null;
  const caja = l?.cajas.find((c) => c.inicio === sel) ?? actual;
  const clave = caja ? `${moneda}:${plazo}:${caja.inicio}` : '';
  const a = an && an.clave === clave ? an.datos : null;
  // la caja actual ya terminó según el reloj: la lista quedó vieja
  const vieja = !!actual && ahora >= actual.fin;

  const actualizar = useCallback(() => { setSel(null); setAn(null); setErrorA(null); lista.run(); }, [lista]);
  // al cerrar la caja actual, la lista se actualiza sola (MEXC tarda unos segundos en publicar el cierre)
  const finActual = actual?.fin ?? null;
  useEffect(() => {
    if (finActual == null || backend.demo) return;
    const espera = finActual + 7000 - Date.now();
    if (espera < 0 || espera > 16 * 60e3) return;
    const t = setTimeout(() => lista.run(), espera);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finActual]);

  const analizar = async () => {
    if (!caja) return;
    const id = ++turno.current, k = clave;
    setCargandoA(true); setErrorA(null);
    try {
      const d = await backend.motor<AnalisisPred>('prediccion_analisis', { moneda, plazo, inicio: caja.inicio });
      if (id === turno.current) setAn({ clave: k, datos: d });
    } catch (e) { if (id === turno.current) setErrorA((e as Error).message || 'No se pudo analizar la caja.'); }
    finally { if (id === turno.current) setCargandoA(false); }
  };
  const elegir = (c: CajaPred) => { turno.current++; setCargandoA(false); setSel(c.inicio); setErrorA(null); };

  // la tira empieza por las cajas viejas: al cargar, la actual queda centrada
  const tira = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const t = tira.current, el = t?.querySelector<HTMLElement>('.pred-actual');
    if (t && el) t.scrollLeft = el.offsetLeft - t.offsetLeft - (t.clientWidth - el.offsetWidth) / 2;
  }, [l?.ahora, moneda, plazo]);

  const estadoCaja = caja ? (caja.estado === 'actual' && ahora >= caja.fin ? 'cerrada' : caja.estado === 'proxima' && ahora >= caja.inicio ? 'actual' : caja.estado) : null;

  return (
    <Pagina titulo="Predicción" acciones={
      <>
        <div className="seg" role="group" aria-label="Moneda">{MONEDAS.map((m) => <button key={m} type="button" aria-pressed={moneda === m} onClick={() => { setMoneda(m); setSel(null); }}>{m}</button>)}</div>
        <div className="seg" role="group" aria-label="Plazo">{PLAZOS.map((p) => <button key={p} type="button" aria-pressed={plazo === p} onClick={() => { setPlazo(p); setSel(null); }}>{p} min</button>)}</div>
        <button type="button" className="btn btn-sm" onClick={actualizar} disabled={lista.cargando}><RefreshCw size={15} aria-hidden style={lista.cargando ? { animation: 'girar 1s linear infinite' } : undefined} />Actualizar</button>
      </>
    }>
      {lista.error && !l ? <ErrorEstado mensaje={lista.error} reintentar={actualizar} /> : !l ? <Esqueleto filas={5} /> : (
        <div className="stack">
          {l.demo_nota && <Nota>{l.demo_nota}</Nota>}
          {lista.error && <Nota tono="warn">No se pudo actualizar: {lista.error}</Nota>}
          {vieja && <Nota tono="warn" titulo="La caja actual ya cerró.">{backend.demo ? 'Pulsa Actualizar para volver a empezar el demo.' : 'Pulsa Actualizar para ver su resultado y la caja nueva.'}</Nota>}

          <Panel titulo={`Cajas de ${l.moneda} · ${l.plazo} min`} aside={<span className="faint num">Índice {fp(l.indice?.precio, 2)} · leído {hora(l.ahora)}</span>} flush>
            <div className="pred-tira" role="list" ref={tira}>
              {l.cajas.map((c) => <div role="listitem" key={c.inicio}><Caja c={c} ahora={ahora} elegida={caja?.inicio === c.inicio} onElegir={() => elegir(c)} /></div>)}
            </div>
          </Panel>

          <div className="grid g-main">
            <div className="stack">
              {caja && (
                <Panel flush titulo={`Caja ${tramo(caja)}`} aside={
                  <button type="button" className="btn btn-sm btn-primary" onClick={analizar} disabled={cargandoA}>
                    <Sparkles size={15} aria-hidden />{cargandoA ? 'Analizando…' : estadoCaja === 'cerrada' ? (a ? 'Volver a ver' : 'Ver cómo terminó') : a ? 'Volver a analizar' : 'Analizar'}
                  </button>
                }>
                  {errorA && <div className="panel-b"><Nota tono="loss">{errorA}</Nota></div>}
                  {a?.demo_nota && <div className="panel-b"><Nota>{a.demo_nota}</Nota></div>}
                  {a ? (
                    <>
                      {a.caja.estado === 'cerrada' ? <DetalleCerrada a={a} /> : <Veredicto a={a} ahora={ahora} />}
                      <div className="panel-b"><GraficoCaja a={a} /></div>
                    </>
                  ) : cargandoA ? <div className="panel-b"><div className="sk" style={{ height: 120 }} /></div> : (
                    <>
                      <KV items={estadoCaja === 'cerrada' ? [
                        { k: 'Resultado', v: caja.resultado ? <LadoPredTag lado={caja.resultado} /> : '—' },
                        { k: 'Precio base', v: fp(caja.base, 2) }, { k: 'Cierre', v: fp(caja.cierre, 2) },
                        { k: 'Cambio', v: pctSigno(caja.cambio_pct, 3), cls: caja.resultado === 'UP' ? 'gain' : 'loss' },
                      ] : estadoCaja === 'actual' ? [
                        { k: 'Cierra en', v: cuenta(caja.fin - ahora), s: `a las ${hora(caja.fin)}` },
                        { k: 'Precio base', v: fp(caja.base, 2), s: 'To Beat en MEXC' },
                        { k: 'Up en MEXC', v: caja.mercado?.up?.venta != null ? numero(caja.mercado.up.venta, 2) : '—', s: 'por acción' },
                        { k: 'Down en MEXC', v: caja.mercado?.down?.venta != null ? numero(caja.mercado.down.venta, 2) : '—', s: 'por acción' },
                      ] : [
                        { k: 'Abre en', v: cuenta(caja.inicio - ahora), s: `a las ${hora(caja.inicio)}` },
                        { k: 'Cierra', v: hora(caja.fin) },
                        { k: 'Precio base', v: caja.base_estimada ? `≈ ${fp(caja.base_estimada, 2)}` : 'Por fijar', s: 'será el cierre de la caja anterior' },
                      ]} />
                      <div className="panel-b">
                        {estadoCaja === 'actual' && caja.p_up != null && <BarraLados up={caja.p_up} etiqueta="Lectura rápida del modelo" />}
                        <p className="muted" style={{ margin: estadoCaja === 'actual' ? 'var(--sp-3) 0 0' : 0 }}>
                          {estadoCaja === 'cerrada' ? 'Pulsa «Ver cómo terminó» para ver su recorrido: máximo, mínimo y cuándo quedó decidida.'
                            : estadoCaja === 'actual' ? 'Esta es una lectura rápida. Pulsa «Analizar» para el veredicto final con el spot en vivo, el precio de MEXC y lo que vale la pena pagar.'
                              : 'Aún no tiene precio base. Pulsa «Analizar» para ver si el spot ya la deja inclinada; lo normal es esperar a su primer minuto.'}
                        </p>
                      </div>
                    </>
                  )}
                </Panel>
              )}

              {a?.factores && (
                <Panel titulo="Qué mira el análisis" flush>
                  <div className="table-wrap"><table className="t">
                    <thead><tr><th>Factor</th><th>Lectura</th><th>Empuja a</th></tr></thead>
                    <tbody>{a.factores.map((x) => (
                      <tr key={x.nombre}>
                        <td><strong>{x.nombre}</strong>{!x.cuenta && <span className="tag" style={{ marginLeft: 6 }}>contexto</span>}<div className="faint" style={{ fontSize: 'var(--fs-xs)', maxWidth: '40ch', whiteSpace: 'normal' }}>{x.texto}</div></td>
                        <td className="num" style={{ whiteSpace: 'normal' }}>{x.valor}</td>
                        <td>{x.hacia ? <LadoPredTag lado={x.hacia} /> : <span className="faint">—</span>}</td>
                      </tr>
                    ))}</tbody>
                  </table></div>
                </Panel>
              )}

              {a?.exchanges && a.exchanges.length > 0 && (
                <Panel titulo="El mismo precio en otros exchanges" flush>
                  <div className="table-wrap"><table className="t">
                    <thead><tr><th>Exchange</th><th style={{ textAlign: 'right' }}>Precio</th><th style={{ textAlign: 'right' }}>Frente a Binance spot</th></tr></thead>
                    <tbody>{a.exchanges.map((x) => (
                      <tr key={x.nombre}><td>{x.nombre} <span className="faint">{x.contra}</span></td><td className="num" style={{ textAlign: 'right' }}>{fp(x.precio, 2)}</td><td className={`num ${x.dif_pb > 0.5 ? 'gain' : x.dif_pb < -0.5 ? 'loss' : ''}`} style={{ textAlign: 'right' }}>{conSigno(x.dif_pb, 1)} pb</td></tr>
                    ))}</tbody>
                  </table></div>
                  <div className="panel-b"><p className="faint" style={{ margin: 0, fontSize: 'var(--fs-sm)' }}>Medido segundo a segundo: Binance y Bybit se mueven primero, Coinbase va ~1 s detrás y MEXC entre 1 y 3 s detrás. Pero el índice que liquida la caja va ~35 s detrás de todos, porque promedia el último minuto: ese es el adelanto que usa el modelo. Los futuros cotizan unos pb por debajo o por encima del spot (no es adelanto).</p></div>
                </Panel>
              )}
            </div>

            <div className="stack">
              {a?.repaso && (
                <Panel titulo="¿Acierta el modelo? Última hora">
                  <p className="muted" style={{ marginTop: 0 }}>Cajas de {a.plazo} min de la última hora, mirando en el mismo punto que ahora ({cuenta((a.transcurrido_s ?? 0) * 1000)} transcurridos): el lado favorito acertó el <strong>{a.repaso.acierto_pct} %</strong> de {a.repaso.muestras} lecturas.</p>
                  <Filas items={a.repaso.tramos.filter((t) => t.n > 0).map((t) => ({ k: `Cuando daba ≥ ${numero(t.desde_pct, 0)} %`, v: `${t.acierto_pct} % (${t.aciertos}/${t.n})` }))} />
                </Panel>
              )}
              {(a?.resumen ?? l.resumen) && (() => { const r = (a?.resumen ?? l.resumen)!; return (
                <Panel titulo="Últimas 12 h de cajas">
                  <Filas items={[
                    { k: 'Cerraron en Up', v: `${r.up_pct} % (${r.up}/${r.n})` },
                    { k: 'Racha actual', v: <>{r.racha.n} × <LadoPredTag lado={r.racha.lado} /></> },
                    { k: 'Repite el lado anterior', v: r.repite_pct == null ? '—' : `${r.repite_pct} %` },
                  ]} />
                  <p className="faint" style={{ marginBottom: 0, fontSize: 'var(--fs-sm)' }}>Las rachas no predicen: cada caja empieza de cero desde el cierre de la anterior.</p>
                </Panel>
              ); })()}
              <Panel titulo="Cómo liquida MEXC">
                <ul className="pred-reglas muted">
                  <li>La base («To Beat») es el cierre de la caja anterior. <strong>Up</strong> gana si el cierre queda por encima; el empate es <strong>Down</strong>.</li>
                  <li>El precio no es el de un exchange: es la <strong>media de los últimos 60 s</strong> del spot (índice de Chainlink contra USD).</li>
                  <li>Por eso el último minuto pesa todo: a 30 s del cierre, medio resultado ya está escrito.</li>
                  <li>Compras acciones de 0 a 1 USDT; si aciertas cobras 1 por acción. Comisión {numero(100 * l.comision, 1)} %.</li>
                  <li>Acertar el lado no basta: si Up tiene 90 % y te lo cobran a 0,92, pierdes a la larga.</li>
                </ul>
              </Panel>
              {!a && !caja && <div className="panel"><Vacio icono={<Sparkles size={28} aria-hidden />} titulo="Elige una caja">Pulsa una caja para ver su detalle.</Vacio></div>}
            </div>
          </div>
        </div>
      )}
    </Pagina>
  );
}
