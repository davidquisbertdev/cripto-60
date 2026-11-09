import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CircleSlash, Clipboard, Eye, Search, ShieldAlert, Zap, Info } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { Campo, ErrorEstado, Esqueleto, Filas, KV, LadoTag, NivelTag, Nota, Panel, Vacio } from '../components/ui';
import { BarraProb, COL, Reloj } from '../components/graficos';
import { backend } from '../lib/api';
import { useSesion } from '../lib/sesion';
import { nombreExchange, estrategiaNombre, hace, hora, numero, pct, pctSigno, precio as fp, usdt, usdtSigno, conSigno } from '../lib/formato';
import type { Bloqueo, Lado, Senal as TSenal, TP } from '../lib/tipos';

const MONEDAS = ['BTC', 'ETH', 'SOL', 'XRP', 'NEAR', 'ENA', 'HYPE', 'ARB', 'TAO', 'MNT', '1000PEPE', 'DOGE'];
type Res = (TSenal & { demo_nota?: string | null }) | Bloqueo;

export function Senal() {
  const { estado, refrescar, aviso } = useSesion();
  const [q] = useSearchParams();
  const nav = useNavigate();
  const [moneda, setMoneda] = useState(q.get('moneda') ?? '');
  const [capital, setCapital] = useState('');
  const [margen, setMargen] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [res, setRes] = useState<Res | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errCampo, setErrCampo] = useState<string | null>(null);
  const [errCapital, setErrCapital] = useState<string | null>(null);

  // Se rellena una sola vez con el capital del diario: si el usuario vacía el campo, se respeta.
  const relleno = useRef(false);
  useEffect(() => {
    if (relleno.current || !estado) return;
    relleno.current = true;
    if (estado.diario) setCapital(String(estado.diario.capital));
    if (estado.cfg) setObjetivo(String(estado.cfg.objetivo_usdt));
  }, [estado]);

  const analizar = async (e?: FormEvent, capitalInicial?: string) => {
    e?.preventDefault();
    const m = moneda.trim().toUpperCase();
    if (!m) { setErrCampo('Escribe una moneda, por ejemplo SOL.'); return; }
    const cap = capitalInicial ?? capital;
    setErrCampo(null);
    if (!(Number(cap.replace(',', '.')) > 0)) { setErrCapital('Indica tu capital en USDT, por ejemplo 20.'); return; }
    setErrCapital(null); setError(null); setCargando(true);
    try {
      const r = await backend.motor<Res>('senal', { moneda: m, capital: cap, margen: margen || undefined, objetivo: objetivo || (estado?.cfg ? String(estado.cfg.objetivo_usdt) : undefined) });
      setRes(r);
    } catch (x) { setError((x as Error).message); setRes(null); }
    finally { setCargando(false); }
  };

  useEffect(() => { if (q.get('moneda') && estado) analizar(undefined, estado.diario ? String(estado.diario.capital) : undefined); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [!!estado]);

  const seguir = async (s: TSenal) => {
    try {
      await backend.abrirPosicion({ base: s.base, lado: s.plan.lado, entrada: s.plan.entrada, sl: s.plan.sl, tps: s.plan.tps.map((t) => t.precio), contratos: s.plan.contratos, estrategia: s.estrategia, senal_id: typeof s.id === 'number' ? s.id : null });
      await refrescar();
      nav('/posicion');
    } catch (x) { aviso((x as Error).message); }
  };

  return (
    <Pagina titulo="Señal">
      <form className="panel" onSubmit={analizar} noValidate>
        <div className="panel-b form-row">
          <Campo etiqueta="Moneda" error={errCampo}>
            <input className="input" list="monedas" value={moneda} onChange={(e) => setMoneda(e.target.value.toUpperCase())} placeholder="SOL" autoCapitalize="characters" autoComplete="off" aria-invalid={!!errCampo} />
            <datalist id="monedas">{MONEDAS.map((m) => <option key={m} value={m} />)}</datalist>
          </Campo>
          <Campo etiqueta="Capital" error={errCapital}>
            <div className="input-wrap"><input className="input num" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} aria-invalid={!!errCapital} /><span className="suf">USDT</span></div>
          </Campo>
          <Campo etiqueta="Margen (opcional)" hint={estado?.diario ? `Sugerido ${usdt(estado.diario.margen_sugerido)}` : undefined}>
            <div className="input-wrap"><input className="input num" inputMode="decimal" value={margen} onChange={(e) => setMargen(e.target.value)} placeholder="auto" /><span className="suf">USDT</span></div>
          </Campo>
          <Campo etiqueta="Objetivo">
            <div className="input-wrap"><input className="input num" inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} /><span className="suf">USDT</span></div>
          </Campo>
          <div className="field field-btn"><span aria-hidden>&nbsp;</span><button className="btn btn-primary" type="submit" disabled={cargando}><Search size={16} aria-hidden />{cargando ? 'Analizando…' : 'Analizar'}</button></div>
        </div>
      </form>

      {estado?.diario?.bloqueo && !res && <Nota tono="loss" titulo="Freno del diario activo.">{estado.diario.bloqueo} <Link to="/diario">Ver diario</Link></Nota>}

      {cargando ? (
        <div className="grid g-main"><Esqueleto filas={6} /><Esqueleto filas={4} /></div>
      ) : error ? (
        <ErrorEstado mensaje={error} reintentar={() => analizar()} />
      ) : !res ? (
        <div className="panel">
          <Vacio icono={<Zap size={28} aria-hidden />} titulo="Pide una señal">
            Escribe la moneda y tu capital. El motor lee 1m, 5m, 15m y 1h, siempre con BTC de guía, el funding, el libro, las ballenas y las noticias, y mide el historial real de esa moneda antes de recomendar nada.
          </Vacio>
        </div>
      ) : 'bloqueado' in res ? (
        <Nota tono="loss" titulo="No se genera la orden.">{res.motivo} {res.pausa_hasta ? `Vuelve a las ${hora(res.pausa_hasta)}.` : ''} <Link to="/diario">Ver diario</Link></Nota>
      ) : (
        <Resultado s={res} onSeguir={seguir} abierta={!!estado?.posicion_abierta} />
      )}
    </Pagina>
  );
}

function filasNiveles(lado: Lado, entrada: number, sl: number, tps: TP[], dec: number, riesgo: number | null) {
  const d = (p: number) => pctSigno((100 * (p - entrada)) / entrada, 2);
  return [
    { k: 'Stop loss', p: fp(sl, dec), d: d(sl), c: '100 %', r: riesgo != null ? usdtSigno(-riesgo) : '—', cls: 'loss' },
    ...tps.map((t) => ({ k: `TP${t.n}`, p: fp(t.precio, dec), d: d(t.precio), c: `${t.cerrar_pct} %`, r: t.ganancia_usdt != null ? usdtSigno(t.ganancia_usdt) : '—', cls: 'gain' })),
  ].map((x) => ({ ...x, lado }));
}

function Tabla({ filas, entrada }: { filas: ReturnType<typeof filasNiveles>; entrada: { limit: number; mercado: number; no_perseguir?: number; dec: number } }) {
  return (
    <div className="table-wrap">
      <table className="t levels">
        <thead><tr><th scope="col">Nivel</th><th scope="col" className="r">Precio</th><th scope="col" className="r hide-sm">Distancia</th><th scope="col" className="r hide-sm">Cierra</th><th scope="col" className="r">Resultado</th></tr></thead>
        <tbody>
          <tr><td>Entrada</td><td className="r num">limit {fp(entrada.limit, entrada.dec)}<span className="sub-line">mercado {fp(entrada.mercado, entrada.dec)}{entrada.no_perseguir ? <><span className="sin-sm"> · no persigas más allá de {fp(entrada.no_perseguir, entrada.dec)}</span><span className="solo-sm"> · máx. {fp(entrada.no_perseguir, entrada.dec)}</span></> : null}</span></td><td className="r faint hide-sm">—</td><td className="r faint hide-sm">—</td><td className="r faint">—</td></tr>
          {filas.map((f) => (
            <tr key={f.k}><td>{f.k}</td><td className={`r num ${f.cls}`}>{f.p}</td><td className="r num muted hide-sm">{f.d}</td><td className="r num hide-sm">{f.c}</td><td className={`r num strong ${f.cls}`}>{f.r}</td></tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function copiarTexto(s: TSenal) {
  const p = s.plan, dec = s.decimales;
  return [
    `${s.recomendacion} ${s.base} · ${estrategiaNombre(s.estrategia)} · confianza ${s.nivel}`,
    `Entrada limit ${fp(s.entrada.limit, dec)} (mercado ${fp(s.entrada.mercado, dec)}) · válida hasta las ${hora(s.entrada.valida_hasta)}`,
    `SL ${fp(p.sl, dec)}`,
    ...p.tps.map((t) => `TP${t.n} ${fp(t.precio, dec)} → cierra ${t.cerrar_pct} %`),
    `${p.apalancamiento}x aislado · margen ${usdt(p.margen)} · ${p.cantidad_moneda} ${s.base}`,
    `Sin TP1 a las ${hora(s.cerrar_si_no_tp1_a_las)}, cierra · a las ${hora(s.cierre_total_a_las)} cierra todo`,
  ].join('\n');
}

function Resultado({ s, onSeguir, abierta }: { s: TSenal & { demo_nota?: string | null }; onSeguir: (s: TSenal) => void; abierta: boolean }) {
  const { aviso } = useSesion();
  const opera = s.recomendacion !== 'NO OPERAR';
  const p = s.plan, dec = s.decimales, sim = s.simulacion, h = s.historial;
  const m = s.mejor_entrada;
  const Ico = !opera ? CircleSlash : s.recomendacion === 'LONG' ? ArrowUpRight : ArrowDownRight;
  const copiar = async () => { try { await navigator.clipboard.writeText(copiarTexto(s)); aviso('Niveles copiados'); } catch { aviso('No se pudo copiar: selecciona el texto a mano.'); } };

  return (
    <>
      {s.demo_nota && <Nota tono="warn">{s.demo_nota}</Nota>}
      <div className="grid g-main ordenar">
        <div className="stack">
          <section className="panel ord-1" aria-label="Veredicto">
            <div className="verdict">
              <span className={`verdict-word ${!opera ? 'none' : s.recomendacion === 'LONG' ? 'long' : 'short'}`}><Ico size={34} strokeWidth={2.4} aria-hidden />{s.recomendacion}</span>
              <div className="verdict-meta">
                <span className="t1">{s.base} · {estrategiaNombre(s.estrategia)}</span>
                <span className="t2 num">{nombreExchange(s.exchange)} · precio {fp(s.precio, dec)} · {hora(s.creada)} ({hace(s.creada)})</span>
              </div>
              <div className="tags"><NivelTag nivel={s.nivel} /><span className="tag num">{s.confianza}/100</span></div>
            </div>
            {opera ? (
              <>
                <Tabla filas={filasNiveles(p.lado, p.entrada, p.sl, p.tps, dec, p.riesgo_usdt)} entrada={{ ...s.entrada, dec }} />
                <div className="money">
                  <div><div className="k">Si salta el SL pierdes</div><div className="v num loss">{conSigno(p.escenarios.sl_directo, 3)}<span className="u">USDT</span></div><div className="s num">{pct(p.riesgo_pct_real)} del capital</div></div>
                  <div><div className="k">Si llegan los 3 TP ganas</div><div className="v num gain">{conSigno(p.escenarios.todos_los_tps, 3)}<span className="u">USDT</span></div><div className="s num">Solo TP1 y luego a entrada: {usdtSigno(p.escenarios.tp1_y_luego_be)}</div></div>
                </div>
                <KV items={[
                  { k: 'Apalancamiento', v: `${p.apalancamiento}x`, s: 'margen aislado' },
                  { k: 'Margen', v: usdt(p.margen, 2), s: `${pct(p.margen_pct_capital, 0)} del capital` },
                  { k: 'Posición', v: `${numero(p.cantidad_moneda, p.cantidad_moneda < 10 ? 3 : 0)} ${s.base}`, s: `${usdt(p.nocional, 0)} nocional` },
                  { k: 'Liquidación', v: fp(p.liquidacion, dec), s: `SL a ${pct(p.sl_pct, 2)}` },
                ]} />
                <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
                  <p className="muted">{p.apalancamiento_razon}</p>
                  {p.objetivo && !p.objetivo.alcanzable && p.objetivo.mensaje && <Nota tono="warn">{p.objetivo.mensaje}</Nota>}
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => onSeguir(s)} disabled={abierta} title={abierta ? 'Ya sigues una posición abierta' : undefined}><Eye size={16} aria-hidden />Entré: seguir la posición</button>
                    <button className="btn" onClick={copiar}><Clipboard size={16} aria-hidden />Copiar niveles</button>
                  </div>
                  {abierta && <span className="faint" style={{ fontSize: 13 }}>Ya sigues una posición. <Link to="/posicion">Ábrela</Link> o ciérrala antes de seguir otra.</span>}
                </div>
              </>
            ) : (
              <div className="panel-b" style={{ display: 'grid', gap: 16 }}>
                <p className="muted" style={{ fontSize: 15 }}>{s.alertas[0] ?? 'Ninguna estrategia tiene ventaja ahora en esta moneda.'}</p>
                {s.reentrada && (
                  <div>
                    <h3 style={{ fontSize: 14, marginBottom: 6 }}>Niveles a vigilar</h3>
                    <Filas items={[
                      { k: 'LONG si rompe por encima de', v: fp(s.reentrada.long_si_rompe, dec), cls: 'gain' },
                      { k: 'SHORT si pierde', v: fp(s.reentrada.short_si_pierde, dec), cls: 'loss' },
                      { k: 'Rebote LONG por debajo de', v: fp(s.reentrada.rebote_long_bajo, dec) },
                      { k: 'Rebote SHORT por encima de', v: fp(s.reentrada.rebote_short_sobre, dec) },
                    ]} />
                  </div>
                )}
                {m && (
                  <details>
                    <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Mejor entrada posible, solo bajo tu riesgo</summary>
                    <div style={{ display: 'grid', gap: 12, marginTop: 12 }}>
                      <Nota tono="warn">El sistema dice NO OPERAR. Esta es la jugada con más probabilidad ({pct(m.prob.pct, 0)}, {m.prob.fuente}), no una recomendación.</Nota>
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><LadoTag lado={m.lado} /><span className="muted">{estrategiaNombre(m.estrategia)} · {m.apalancamiento}x · margen {usdt(m.margen)}</span></div>
                      <Tabla filas={filasNiveles(m.lado, m.entrada.mercado, m.sl, m.tps, dec, m.riesgo_usdt)} entrada={{ ...m.entrada, dec }} />
                    </div>
                  </details>
                )}
              </div>
            )}
          </section>

          <div className="grid g-2 ord-4">
            <Panel titulo="Por qué">
              <ul className="list">{s.razones.map((r) => <li key={r}><Info size={14} aria-hidden />{r}</li>)}</ul>
            </Panel>
            <Panel titulo="Alertas" aside={s.alertas.length ? <span className="tag tag-warn num">{s.alertas.length}</span> : null}>
              {s.alertas.length ? <ul className="list">{s.alertas.map((r) => <li key={r}><ShieldAlert size={14} aria-hidden className="warn" />{r}</li>)}</ul> : <p className="muted">Sin alertas.</p>}
            </Panel>
          </div>

          <Panel titulo="Contexto del mercado" className="ord-5">
            <Filas items={[
              { k: 'Filtro de BTC', v: s.btc_filtro ? s.btc_filtro.estado : '—', cls: s.btc_filtro?.estado === 'a favor' ? 'gain' : s.btc_filtro?.estado === 'en contra' ? 'loss' : '' },
              { k: 'Funding', v: s.contexto.funding != null ? `${pctSigno(s.contexto.funding * 100, 4)}${s.contexto.minutos_a_funding != null ? ` · se cobra en ${s.contexto.minutos_a_funding} min` : ''}` : '—' },
              { k: 'Cambio 15 min / 24 h', v: `${pctSigno(s.contexto.cambio_15m_pct)} / ${pctSigno(s.contexto.cambio_24h_pct)}` },
              { k: 'ATR de 5 min', v: pct(s.contexto.atr5_pct, 3) },
              { k: 'RSI 1m · 5m · 15m · 1h', v: ['1m', '5m', '15m', '1h'].map((k) => numero(s.contexto.rsi[k], 0)).join(' · ') },
              { k: 'Spread', v: pct(s.contexto.spread_pct, 3) },
              { k: 'Fear & Greed', v: s.contexto.fng ? `${s.contexto.fng.valor} · ${s.contexto.fng.clase}` : '—' },
              { k: 'Ballenas', v: s.ballenas?.lectura ?? '—', cls: (s.ballenas?.puntuacion ?? 0) > 0.15 ? 'gain' : (s.ballenas?.puntuacion ?? 0) < -0.15 ? 'loss' : '' },
            ]} />
          </Panel>
        </div>

        <div className="stack">
          {opera && (
            <Panel titulo="Reloj de la operación" aside="cuenta regresiva" flush className="ord-2">
              <Reloj desde={s.creada} hitos={[
                { que: 'La entrada caduca', a: s.entrada.valida_hasta },
                { que: 'Sin TP1, cierra', a: s.cerrar_si_no_tp1_a_las },
                { que: 'Cierre total', a: s.cierre_total_a_las },
              ]} />
            </Panel>
          )}
          {sim && (
            <Panel titulo={`Probabilidades en ${sim.horizonte_min} min`} aside={`${numero(sim.simulaciones, 0)} simulaciones`} className="ord-3">
              <div style={{ display: 'grid', gap: 14 }}>
                <BarraProb partes={[{ que: 'TP1', v: sim.prob.tp1, color: COL.gain }, { que: 'SL', v: sim.prob.sl_antes_tp1, color: COL.loss }, { que: 'Por tiempo', v: sim.prob.cierre_por_tiempo, color: COL.neutro }]} />
                <p className="muted" style={{ fontSize: 13 }}>El TP1 suele llegar en {sim.minutos_tp1.mediana} min (la mitad de las veces entre {sim.minutos_tp1.p25} y {sim.minutos_tp1.p75}). La simulación mide tiempos y distancias, no la ventaja.</p>
              </div>
            </Panel>
          )}
          <Panel titulo="Historial real" aside={h ? `últimas ${numero(h.horas, 0)} h` : undefined} className="ord-3">
            {h && h.n ? (
              <div style={{ display: 'grid', gap: 12 }}>
                <Filas items={[
                  { k: 'Operaciones con este plan', v: h.n },
                  { k: 'Ganadoras', v: pct(h.acierto_pct, 0) },
                  { k: 'Resultado medio (con comisiones)', v: `${conSigno(h.r_medio_neto, 2)} R`, cls: h.r_medio_neto > 0 ? 'gain' : h.r_medio_neto < 0 ? 'loss' : '' },
                  { k: 'TP1 · SL · tiempo', v: `${pct(h.tp1_pct, 0)} · ${pct(h.sl_pct, 0)} · ${pct(h.tiempo_pct, 0)}` },
                ]} />
                <p className="faint" style={{ fontSize: 12 }}>Si el historial sale negativo, créele. Es poco tiempo: lo que funcionó ayer puede no funcionar hoy.</p>
              </div>
            ) : <p className="muted">Sin operaciones comparables suficientes en esta moneda.</p>}
          </Panel>
          <Panel titulo="Estrategias evaluadas" flush className="ord-6">
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th scope="col">Estrategia</th><th scope="col">Lado</th><th scope="col" className="r">Historial</th></tr></thead>
                <tbody>
                  {s.estrategias_evaluadas.map((x) => (
                    <tr key={x.estrategia}>
                      <td>{estrategiaNombre(x.estrategia)}<div className="faint" style={{ fontSize: 12 }}>{x.nivel === 'NO OPERAR' ? 'no operar' : `confianza ${x.nivel.toLowerCase()}`}</div></td><td><LadoTag lado={x.lado} size={12} /></td>
                      <td className={`r num ${x.historial ? (x.historial.r_medio_neto >= 0 ? 'gain' : 'loss') : 'faint'}`} title={x.historial ? `${x.historial.n} operaciones, ${x.historial.acierto_pct} % ganadoras` : undefined}>{x.historial ? `${conSigno(x.historial.r_medio_neto)} R` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          {s.noticias?.propias?.length ? (
            <Panel titulo="Noticias de la moneda" aside={<Link to="/noticias">Ver todas</Link>} flush className="ord-6">
              <div className="news">{s.noticias.propias.slice(0, 3).map((n) => (
                <a className="item" key={n.titulo} href={n.enlace} target="_blank" rel="noreferrer">
                  <span className={`tag ${n.sentimiento > 0 ? 'tag-gain' : n.sentimiento < 0 ? 'tag-loss' : ''} num`}>{conSigno(n.sentimiento, 0) || '0'}</span>
                  <span><span className="ttl">{n.titulo}</span><span className="meta" style={{ display: 'block' }}>{n.fuente} · {hace(n.fecha)}</span></span>
                </a>
              ))}</div>
            </Panel>
          ) : null}
        </div>
      </div>
    </>
  );
}
