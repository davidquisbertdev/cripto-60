import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowDownRight, ArrowUpRight, CircleSlash, Clipboard, Eye, Search, ShieldAlert, Zap, Info } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { Campo, ErrorEstado, Esqueleto, Filas, KV, LadoTag, NivelTag, Nota, Panel, Vacio } from '../components/ui';
import { BarraProb, COL, Reloj } from '../components/graficos';
import { SelectorMoneda } from '../components/SelectorMoneda';
import { EditorTPs, errorReparto } from '../components/EditorTPs';
import { MapaCalorLiq, PanelConfluencias, PanelFib, PanelFlujo } from '../components/Confluencias';
import { PanelCalendario } from '../components/Calendario';
import { MejorMomento } from '../components/MejorMomento';
import { PanelBots } from './Panorama';
import { backend } from '../lib/api';
import { useSesion } from '../lib/sesion';
import { nombreExchange, estrategiaNombre, hace, hora, millones, numero, pct, pctSigno, precio as fp, usdt, usdtSigno, conSigno } from '../lib/formato';
import type { Bloqueo, Lado, ObjetivoInfo, Senal as TSenal, TP } from '../lib/tipos';

type Res = (TSenal & { demo_nota?: string | null }) | Bloqueo;

export function Senal() {
  const { estado, refrescar, aviso } = useSesion();
  const [q] = useSearchParams();
  const nav = useNavigate();
  const [moneda, setMoneda] = useState(q.get('moneda') ?? 'BTC');
  const [capital, setCapital] = useState('');
  const [margen, setMargen] = useState('');
  // apalancamiento elegido para esta señal ('' = el que calcula el motor)
  const [apal, setApal] = useState('');
  const [objetivo, setObjetivo] = useState('');
  const [duracion, setDuracion] = useState('');
  const [errDur, setErrDur] = useState<string | null>(null);
  const [reparto, setReparto] = useState<number[] | null>(null);
  const [verTPs, setVerTPs] = useState(false);
  const [res, setRes] = useState<Res | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errCampo, setErrCampo] = useState<string | null>(null);
  const [errCapital, setErrCapital] = useState<string | null>(null);
  // lado: '' = el que recomiende el sistema; LONG/SHORT = el usuario lo elige (con advertencia si va en contra)
  const [lado, setLado] = useState<'' | Lado>('');
  // última señal automática: se manda al pedir el otro lado para que el aviso diga qué se recomendó y por qué
  const [previa, setPrevia] = useState<TSenal | null>(null);

  // Se rellena una sola vez con el capital del diario: si el usuario vacía el campo, se respeta.
  const relleno = useRef(false);
  useEffect(() => {
    if (relleno.current || !estado) return;
    relleno.current = true;
    if (estado.diario) setCapital(String(estado.diario.capital));
    if (estado.cfg) { setObjetivo(String(estado.cfg.objetivo_usdt)); setDuracion(String(estado.cfg.duracion_max_min)); setReparto(repartoCfg(estado.cfg)); }
  }, [estado]);

  const analizar = async (e?: FormEvent, capitalInicial?: string, ladoPedido?: '' | Lado, apalPedido?: string) => {
    e?.preventDefault();
    const m = moneda.trim().toUpperCase();
    if (!m) { setErrCampo('Escribe una moneda, por ejemplo SOL.'); return; }
    const cap = capitalInicial ?? capital;
    setErrCampo(null);
    if (!(Number(cap.replace(',', '.')) > 0)) { setErrCapital('Indica tu capital en USDT, por ejemplo 20.'); return; }
    setErrCapital(null);
    const dur = duracion.trim() === '' ? undefined : Number(duracion);
    if (dur !== undefined && !(dur >= 15 && dur <= 1440)) { setErrDur('Entre 15 y 1440 minutos.'); return; }
    setErrDur(null);
    const eR = reparto ? errorReparto(reparto) : null;
    if (eR) { setVerTPs(true); return; }
    // solo se manda si es distinto del de Ajustes
    const rep = reparto && estado?.cfg && reparto.join() !== repartoCfg(estado.cfg).join() ? reparto : undefined;
    const l = ladoPedido ?? lado;
    const ap = (apalPedido ?? apal).trim();
    if (ap && !(Number(ap) >= 1 && Number(ap) <= 500)) { setError('El apalancamiento va de 1x a 500x.'); return; }
    const prev = l && previa && previa.base === m ? { recomendacion: previa.recomendacion, lado: previa.lado, estrategia: previa.estrategia, nivel: previa.nivel, razones: previa.razones } : undefined;
    setError(null); setCargando(true);
    try {
      const r = await backend.motor<Res>('senal', { moneda: m, capital: cap, margen: margen || undefined, objetivo: objetivo || (estado?.cfg ? String(estado.cfg.objetivo_usdt) : undefined), duracion: dur, reparto: rep, lado: l || undefined, previa: prev, apalancamiento: ap ? Number(ap) : undefined });
      setRes(r);
      if (!l && !('bloqueado' in r)) setPrevia(r);
    } catch (x) { setError((x as Error).message); setRes(null); }
    finally { setCargando(false); }
  };

  useEffect(() => { if (q.get('moneda') && estado) analizar(undefined, estado.diario ? String(estado.diario.capital) : undefined); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [!!estado]);

  const seguir = async (s: TSenal) => {
    try {
      await backend.abrirPosicion({ base: s.base, lado: s.plan.lado, entrada: s.plan.entrada, sl: s.plan.sl, tps: s.plan.tps.map((t) => t.precio), contratos: s.plan.contratos, estrategia: s.estrategia, senal_id: typeof s.id === 'number' ? s.id : null, ...(estado && s.duracion_max_min !== estado.cfg.duracion_max_min ? { duracion_max_min: s.duracion_max_min } : {}) });
      await refrescar();
      nav('/posicion');
    } catch (x) { aviso((x as Error).message); }
  };

  return (
    <Pagina titulo="Señal">
      <form className="panel" onSubmit={analizar} noValidate>
        <div className="panel-b form-row">
          <Campo etiqueta="Moneda" error={errCampo}>
            <SelectorMoneda valor={moneda} onCambio={setMoneda} placeholder="BTC" invalido={!!errCampo} />
          </Campo>
          <Campo etiqueta="Capital" error={errCapital}>
            <div className="input-wrap"><input className="input num" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} aria-invalid={!!errCapital} /><span className="suf">USDT</span></div>
          </Campo>
          <Campo etiqueta="Margen (opcional)" hint={estado?.diario ? `Sugerido ${usdt(estado.diario.margen_sugerido)}` : undefined}>
            <div className="input-wrap"><input className="input num" inputMode="decimal" value={margen} onChange={(e) => setMargen(e.target.value)} placeholder="auto" /><span className="suf">USDT</span></div>
          </Campo>
          <Campo etiqueta="Apalancamiento (opcional)" hint={apal ? 'Lo eliges tú: te aviso si no es el que recomiendo.' : 'Auto: el que calcule el motor.'}>
            <div className="input-wrap"><input className="input num" type="number" min={1} max={500} step={1} value={apal} onChange={(e) => setApal(e.target.value)} placeholder="auto" /><span className="suf">x</span></div>
          </Campo>
          <Campo etiqueta="Objetivo">
            <div className="input-wrap"><input className="input num" inputMode="decimal" value={objetivo} onChange={(e) => setObjetivo(e.target.value)} /><span className="suf">USDT</span></div>
          </Campo>
          <Campo etiqueta="Duración" error={errDur} hint={estado?.cfg && duracion !== '' && Number(duracion) !== estado.cfg.duracion_max_min ? `En Ajustes: ${estado.cfg.duracion_max_min} min` : 'Cierre total de la operación.'}>
            <div className="input-wrap"><input className="input num" type="number" min={15} max={1440} step={5} value={duracion} onChange={(e) => setDuracion(e.target.value)} aria-invalid={!!errDur} /><span className="suf">min</span></div>
          </Campo>
          <Campo etiqueta="Lado" hint={lado ? 'Lo eliges tú: te aviso si va contra mi análisis.' : 'El que recomiende el análisis.'}>
            <div className="seg" role="group" aria-label="Lado de la operación">
              {([['', 'Auto'], ['LONG', 'LONG'], ['SHORT', 'SHORT']] as const).map(([v, t]) => <button type="button" key={t} aria-pressed={lado === v} onClick={() => setLado(v)}>{t}</button>)}
            </div>
          </Campo>
          <div className="field field-btn"><span aria-hidden>&nbsp;</span><button className="btn btn-primary" type="submit" disabled={cargando}><Search size={16} aria-hidden />{cargando ? 'Analizando…' : 'Analizar'}</button></div>
        </div>
        {reparto && (
          <div className="panel-b" style={{ borderTop: '1px solid var(--line)', display: 'grid', gap: 10 }}>
            <button type="button" className="link-btn" aria-expanded={verTPs} aria-controls="senal-tps" onClick={() => setVerTPs(!verTPs)} style={{ fontSize: 13 }}>
              Take profits: {reparto.length} TP · {reparto.map((x) => `${Number.isFinite(x) ? x : '—'} %`).join(' · ')}{estado?.cfg && reparto.join() !== repartoCfg(estado.cfg).join() ? ' (solo esta señal)' : ' (de Ajustes)'} {verTPs ? '▲' : '▼'}
            </button>
            {verTPs && <div id="senal-tps"><EditorTPs id="senal-tp" valor={reparto} onCambio={setReparto} /></div>}
          </div>
        )}
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
        <Resultado s={res} onSeguir={seguir} abierta={!!estado?.posicion_abierta} onLado={(l) => { setLado(l); analizar(undefined, undefined, l); }} onApal={(x) => { setApal(x); analizar(undefined, undefined, undefined, x); }} />
      )}
    </Pagina>
  );
}

const repartoCfg = (cfg: Record<string, unknown>) => (Array.isArray(cfg.reparto_tps) ? (cfg.reparto_tps as number[]) : [50, 25, 25]);

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

// Qué hacen las ballenas en esta moneda y si van con la señal o en contra (ya entra en el cálculo).
function PanelBallenas({ s }: { s: TSenal }) {
  const b = s.ballenas!, hl = b.hl;
  const total = hl ? hl.valor_long + hl.valor_short : 0;
  const lado = s.recomendacion !== 'NO OPERAR' ? s.recomendacion : s.lado;
  const va = b.puntuacion > 0.15 ? 'LONG' : b.puntuacion < -0.15 ? 'SHORT' : null;
  const relacion = !va ? 'neutrales: no empujan la señal' : va === lado ? `a favor del ${lado}` : `en contra del ${lado}`;
  return (
    <Panel titulo="Ballenas en la señal" aside={<span className={`tag ${va ? (va === lado ? 'tag-gain' : 'tag-loss') : ''}`}>{relacion}</span>} className="ord-5">
      <div style={{ display: 'grid', gap: 12 }}>
        {hl?.ventana === '24h' && <p style={{ fontSize: 13, fontWeight: 600 }}>Hyperliquid: lo que abrieron o aumentaron en las últimas 24 h{hl.nuevas ? ` (${hl.nuevas} posiciones nuevas)` : ''}</p>}
        {hl && total > 0 ? (
          <div>
            <div className="split-bar" role="img" aria-label={`Hyperliquid${hl.ventana === '24h' ? ' en 24 h' : ''}: ${hl.longs} ballenas LONG con ${millones(hl.valor_long)} y ${hl.shorts} SHORT con ${millones(hl.valor_short)}`}>
              <i style={{ width: `${(100 * hl.valor_long) / total}%`, background: 'var(--gain)' }} />
              <i style={{ width: `${(100 * hl.valor_short) / total}%`, background: 'var(--loss)' }} />
            </div>
            <div className="prob-legend" style={{ marginTop: 8 }}>
              <span><i className="sw" style={{ background: 'var(--gain)' }} aria-hidden />{hl.longs} LONG <b className="num">{millones(hl.valor_long)}</b></span>
              <span><i className="sw" style={{ background: 'var(--loss)' }} aria-hidden />{hl.shorts} SHORT <b className="num">{millones(hl.valor_short)}</b></span>
            </div>
          </div>
        ) : <p className="muted" style={{ fontSize: 13 }}>{hl?.ventana === '24h' ? `Ninguna de las ${hl.revisadas ?? ''} ballenas más grandes de Hyperliquid en ${s.base} abrió ni aumentó posición en 24 h` : `Ninguna ballena de Hyperliquid tiene posición grande en ${s.base}`}: cuentan el flujo, el open interest y los top traders.</p>}
        {hl?.ventana === '24h' && hl.total && hl.total.longs + hl.total.shorts > 0 && (
          <p className="faint" style={{ fontSize: 12 }}>Posiciones abiertas de antes: {hl.total.longs} LONG ({millones(hl.total.valor_long)}) y {hl.total.shorts} SHORT ({millones(hl.total.valor_short)}). Son contexto de fondo y no pesan en la señal; las ves todas en <Link to="/ballenas">Ballenas</Link>.</p>
        )}
        <Filas items={[
          { k: 'Lectura del dinero grande', v: `${b.lectura} (${conSigno(b.puntuacion)})`, cls: b.puntuacion > 0.15 ? 'gain' : b.puntuacion < -0.15 ? 'loss' : '' },
          ...(b.top_long != null ? [{ k: 'Top traders en LONG', v: pct(b.top_long * 100, 0) }] : []),
          ...(b.minoristas_long != null ? [{ k: 'Todas las cuentas en LONG', v: pct(b.minoristas_long * 100, 0) }] : []),
        ]} />
        {b.frases.length > 0 && <ul className="list">{b.frases.slice(0, 3).map((t) => <li key={t}><Info size={14} aria-hidden />{t}</li>)}</ul>}
        <p className="faint" style={{ fontSize: 12 }}>Pesan en la puntuación y bajan la confianza si van en contra (un nivel si van fuerte en contra). Nunca deciden solas. <Link to="/ballenas">Ver ballenas</Link></p>
      </div>
    </Panel>
  );
}

// El objetivo en USDT no se alcanza: el motor no pasa del tope de pérdida, del margen ni del apalancamiento seguro.
function ObjetivoNota({ o }: { o: ObjetivoInfo }) {
  // de dónde sale el % de pérdida: tu ajuste de esa confianza, el tope del motor (10 %) y el freno del diario
  const nivel = (o.nivel_riesgo ?? '').toLowerCase();
  const origen = o.riesgo_ajuste_pct == null ? 'con esta confianza'
    : o.factor_riesgo != null && o.factor_riesgo < 1 ? `tu ajuste para confianza ${nivel} es ${o.riesgo_ajuste_pct} %, a la mitad por las pérdidas seguidas del diario`
    : `tu ajuste «Pérdida en el SL, confianza ${nivel}»; lo puedes subir en Ajustes`;
  const freno = o.limitante === 'riesgo' ? `tu pérdida máxima en el SL: ${o.riesgo_tope_pct ?? '—'} % del capital (${origen})` : o.limitante === 'usuario' ? 'el apalancamiento que elegiste' : `el apalancamiento seguro (${o.apalancamiento_max ?? '—'}x) con tu margen`;
  return (
    <Nota tono="warn" titulo={`Objetivo ${usdt(o.objetivo)}: este plan llega a ${usdt(o.alcanza ?? null)}.`}>
      Lo frena {freno}. {o.ayuda ?? o.mensaje}
    </Nota>
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

// Cambiar de lado: pedir la mejor entrada del lado contrario (o volver a lo que recomienda el sistema).
function CambiarLado({ s, onLado }: { s: TSenal; onLado: (l: '' | Lado) => void }) {
  const opera = s.recomendacion !== 'NO OPERAR';
  if (s.lado_pedido) return <button type="button" className="btn btn-sm" onClick={() => onLado('')}>Volver a lo que recomienda el sistema</button>;
  const lados: Lado[] = opera ? [s.recomendacion === 'LONG' ? 'SHORT' : 'LONG'] : ['LONG', 'SHORT'];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <span className="faint" style={{ fontSize: 13 }}>{opera ? '¿Quieres ir al revés?' : '¿Quieres entrar igual?'}</span>
      {lados.map((l) => <button type="button" key={l} className="btn btn-sm" onClick={() => onLado(l)}>{opera ? `Prefiero entrar en ${l}` : `Ver la mejor entrada en ${l}`}</button>)}
    </div>
  );
}

function Resultado({ s, onSeguir, abierta, onLado, onApal }: { s: TSenal & { demo_nota?: string | null }; onSeguir: (s: TSenal) => void; abierta: boolean; onLado: (l: '' | Lado) => void; onApal: (x: string) => void }) {
  const { aviso } = useSesion();
  const opera = s.recomendacion !== 'NO OPERAR';
  const p = s.plan, dec = s.decimales, sim = s.simulacion, h = s.historial;
  const m = s.mejor_entrada;
  // con un lado elegido por el usuario se muestra su plan aunque el sistema diga NO OPERAR (bajo su riesgo)
  const pedido = s.lado_pedido ?? null;
  const verPlan = opera || (!!pedido && p.viable);
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
            <div className="panel-b" style={{ display: 'grid', gap: 10, paddingBottom: 0 }}>
              {pedido && s.aviso_lado && (
                <Nota tono={s.contra_sistema ? 'warn' : 'info'} titulo={s.contra_sistema ? `Elegiste ${pedido}, contra mi recomendación.` : `Elegiste ${pedido}.`}>
                  {s.aviso_lado.replace(/^Elegiste (LONG|SHORT)[.:] ?/, '')}{!opera && p.viable ? ' Abajo tienes el plan de ese lado.' : ''}
                </Nota>
              )}
              <CambiarLado s={s} onLado={onLado} />
            </div>
            {verPlan ? (
              <>
                <Tabla filas={filasNiveles(p.lado, p.entrada, p.sl, p.tps, dec, p.riesgo_usdt)} entrada={{ ...s.entrada, dec }} />
                {s.entrada.optima && <MejorMomento o={s.entrada.optima} dec={dec} />}
                <div className="money">
                  <div><div className="k">Si salta el SL pierdes</div><div className="v num loss">{conSigno(p.escenarios.sl_directo, 3)}<span className="u">USDT</span></div><div className="s num">{pct(p.riesgo_pct_real)} del capital</div></div>
                  <div><div className="k">{p.tps.length > 1 ? `Si llegan los ${p.tps.length} TP ganas` : 'Si llega el TP ganas'}</div><div className="v num gain">{conSigno(p.escenarios.todos_los_tps, 3)}<span className="u">USDT</span></div><div className="s num">{p.objetivo ? <>Tu objetivo: {usdt(p.objetivo.objetivo)}{p.objetivo.alcanzable ? ' ✓' : ' · no alcanzable'}</> : p.tps.length > 1 ? <>Solo TP1 y luego a entrada: {usdtSigno(p.escenarios.tp1_y_luego_be)}</> : <>cierra el 100 % en el TP1</>}</div></div>
                </div>
                {p.aviso_apalancamiento && (
                  <div className="panel-b" style={{ paddingBottom: 0 }}>
                    <Nota tono={p.liquida_antes_sl ? 'loss' : 'warn'} titulo={`Apalancamiento ${p.apalancamiento}x elegido por ti.`}>
                      {p.aviso_apalancamiento.replace(/^Elegiste d+x; /, '')}{' '}
                      <button type="button" className="link-btn" onClick={() => onApal('')}>Usar el recomendado ({p.apalancamiento_recomendado}x)</button>
                    </Nota>
                  </div>
                )}
                {p.objetivo && !p.objetivo.alcanzable && <div className="panel-b" style={{ paddingBottom: 0 }}><ObjetivoNota o={p.objetivo} /></div>}
                <KV items={[
                  { k: 'Apalancamiento', v: `${p.apalancamiento}x`, s: p.apalancamiento_usuario ? `elegido · recomendado ${p.apalancamiento_recomendado}x` : 'margen aislado' },
                  { k: 'Margen', v: usdt(p.margen, 2), s: `${pct(p.margen_pct_capital, 0)} del capital` },
                  { k: 'Posición', v: `${numero(p.cantidad_moneda, p.cantidad_moneda < 10 ? 3 : 0)} ${s.base}`, s: `${usdt(p.nocional, 0)} nocional` },
                  { k: 'Liquidación', v: fp(p.liquidacion, dec), s: `SL a ${pct(p.sl_pct, 2)}` },
                ]} />
                <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
                  <p className="muted">{p.apalancamiento_razon}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn btn-primary" onClick={() => onSeguir(s)} disabled={abierta} title={abierta ? 'Ya sigues una posición abierta' : undefined}><Eye size={16} aria-hidden />{opera ? 'Entré: seguir la posición' : `Entré en ${p.lado} igual: seguirla`}</button>
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
                      {m.entrada.optima && <MejorMomento o={m.entrada.optima} dec={dec} />}
                      {m.objetivo && !m.objetivo.alcanzable && <ObjetivoNota o={m.objetivo} />}
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

          <PanelConfluencias s={s} />
          {s.liquidaciones && <MapaCalorLiq m={s.liquidaciones} dec={dec} lado={opera ? s.lado : m?.lado} sl={opera ? p.sl : m?.sl} tp1={opera ? p.tps[0]?.precio : m?.tps[0]?.precio} />}
          {s.flujo && <PanelFlujo f={s.flujo} dec={dec} />}
          {s.bots?.disponible && <PanelBots b={s.bots} moneda={s.base} className="ord-5" />}
          {s.calendario && <PanelCalendario c={s.calendario} className="ord-4" max={6} />}
          {s.ballenas && <PanelBallenas s={s} />}
          <Panel titulo="Contexto del mercado" className="ord-5">
            <Filas items={[
              { k: 'Filtro de BTC', v: s.btc_filtro ? s.btc_filtro.estado : '—', cls: s.btc_filtro?.estado === 'a favor' ? 'gain' : s.btc_filtro?.estado === 'en contra' ? 'loss' : '' },
              { k: 'Funding', v: s.contexto.funding != null ? `${pctSigno(s.contexto.funding * 100, 4)}${s.contexto.minutos_a_funding != null ? ` · se cobra en ${s.contexto.minutos_a_funding} min` : ''}` : '—' },
              { k: 'Cambio 15 min / 24 h', v: `${pctSigno(s.contexto.cambio_15m_pct)} / ${pctSigno(s.contexto.cambio_24h_pct)}` },
              { k: 'ATR de 5 min', v: pct(s.contexto.atr5_pct, 3) },
              { k: 'RSI 1m · 5m · 15m · 1h', v: ['1m', '5m', '15m', '1h'].map((k) => numero(s.contexto.rsi[k], 0)).join(' · ') },
              { k: 'Spread', v: pct(s.contexto.spread_pct, 3) },
              { k: 'Fear & Greed', v: s.contexto.fng ? `${s.contexto.fng.valor} · ${s.contexto.fng.clase}` : '—' },
              ...(s.contexto.macro ?? []).map((x) => ({ k: `${x.nombre} 1 h · 24 h`, v: `${pctSigno(x.cambio_1h)} · ${pctSigno(x.cambio_24h)}${x.choque ? ' · brusco' : ''}`, cls: x.choque ? 'warn' : '' })),
              { k: 'Ballenas', v: s.ballenas?.lectura ?? '—', cls: (s.ballenas?.puntuacion ?? 0) > 0.15 ? 'gain' : (s.ballenas?.puntuacion ?? 0) < -0.15 ? 'loss' : '' },
            ]} />
          </Panel>
        </div>

        <div className="stack">
          {opera && (
            <Panel titulo="Reloj de la operación" aside={`duración ${s.duracion_max_min} min${s.espera_max_min ? ` · TP1 en ${s.espera_max_min} min` : ''}`} flush className="ord-2">
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
          {s.fibonacci && <PanelFib fib={s.fibonacci} dec={dec} precio={s.precio} />}
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
