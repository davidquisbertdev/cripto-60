// SWING: operaciones de días a semanas en velas diarias. Análisis de la moneda (setup que gana en su
// historial de 2 años), gráfico con los puntos de entrada y salida, y las operaciones guardadas en la cuenta
// con su seguimiento (¿se acerca al TP1? ¿rompió el SL? ¿toca mover el SL?).
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowDownRight, ArrowUpRight, CircleSlash, PlusCircle, RefreshCw, Trash2, TrendingUp, X } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { Campo, ErrorEstado, Esqueleto, Filas, KV, LadoTag, NivelTag, Nota, Panel, Vacio } from '../components/ui';
import { SelectorMoneda } from '../components/SelectorMoneda';
import { GraficoSwing, type MarcaGrafico, type NivelGrafico } from '../components/GraficoSwing';
import { backend } from '../lib/api';
import { useSesion } from '../lib/sesion';
import { usePeticion } from '../lib/usar';
import { conSigno, fechaCorta, fechaHora, numero, pct, pctSigno, precio as fp, usdt } from '../lib/formato';
import type { EvalSwing, InformeSwing, InformeSwingRevisar, Lado, SwingEvento, SwingOperacion } from '../lib/tipos';

const ACCION_TONO: Record<string, string> = { MANTENER: 'tag-gain', 'MOVER SL': 'tag-warn', REDUCIR: 'tag-warn', CERRAR: 'tag-loss', CERRADA: '' };
const paraMotor = (o: SwingOperacion) => ({ id: String(o.id), base: o.base, lado: o.lado, entrada: o.entrada, sl: o.sl, tp1: o.tp1, trailing: o.trailing, abierta_en: Date.parse(o.abierta_en), eventos: o.eventos });
// decimales según el tamaño del precio (BTC 1, ETH 2, monedas pequeñas 4)
const decDe = (p: number) => (p >= 1000 ? 1 : p >= 10 ? 2 : p >= 1 ? 3 : 5);
const ahoraLocal = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

// Barra entre el SL y el TP1 con la entrada y el precio de hoy
function Camino({ o, e, dec }: { o: SwingOperacion; e: EvalSwing | null; dec: number }) {
  if (!e || o.tp1 == null) return null;
  const lo = Math.min(o.sl, o.tp1), hi = Math.max(o.sl, o.tp1), pos = (p: number) => `${Math.max(0, Math.min(100, (100 * (p - lo)) / (hi - lo)))}%`;
  const izqSL = o.sl < o.tp1;
  return (
    <div style={{ display: 'grid', gap: 4 }}>
      <div style={{ position: 'relative', height: 8, borderRadius: 999, background: `linear-gradient(90deg, ${izqSL ? 'var(--loss-soft, rgba(239,68,68,.25))' : 'var(--gain-soft, rgba(34,197,94,.25))'}, var(--s3), ${izqSL ? 'var(--gain-soft, rgba(34,197,94,.25))' : 'var(--loss-soft, rgba(239,68,68,.25))'})` }} role="img" aria-label={`Precio ${fp(e.precio, dec)} entre el SL ${fp(o.sl, dec)} y el TP1 ${fp(o.tp1, dec)}`}>
        <i style={{ position: 'absolute', left: pos(o.entrada), top: -3, width: 2, height: 14, background: 'var(--accent)' }} />
        <i style={{ position: 'absolute', left: pos(e.precio), top: -4, width: 10, height: 16, marginLeft: -5, borderRadius: 3, background: 'var(--text)' }} />
      </div>
      <div className="num faint" style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span>{izqSL ? `SL ${fp(o.sl, dec)}` : `TP1 ${fp(o.tp1, dec)}`}</span><span>hoy {fp(e.precio, dec)}</span><span>{izqSL ? `TP1 ${fp(o.tp1, dec)}` : `SL ${fp(o.sl, dec)}`}</span>
      </div>
    </div>
  );
}

interface Registro { modo: 'nueva' | 'evento'; op?: SwingOperacion; tipo: 'entrada' | 'salida'; lado: Lado; precio: number; sl?: number; tp1?: number | null; setup?: string | null }

function ModalRegistro({ r, base, dec, onCerrar, onGuardado }: { r: Registro; base: string; dec: number; onCerrar: () => void; onGuardado: (o?: SwingOperacion) => void }) {
  const { aviso } = useSesion();
  const [tipo, setTipo] = useState(r.tipo);
  const [lado, setLado] = useState<Lado>(r.lado);
  const [precio, setPrecio] = useState(String(r.precio));
  const [sl, setSl] = useState(r.sl != null ? String(r.sl) : '');
  const [tp1, setTp1] = useState(r.tp1 != null ? String(r.tp1) : '');
  const [porc, setPorc] = useState(r.tipo === 'salida' ? '50' : '100');
  const [fecha, setFecha] = useState(ahoraLocal());
  const [nota, setNota] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const cerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => { cerrar.current?.focus(); const k = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar(); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onCerrar]);
  const nueva = r.modo === 'nueva';
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const p = Number(precio.replace(',', '.')), s = Number(sl.replace(',', '.')), t = tp1 ? Number(tp1.replace(',', '.')) : null, q = Number(porc);
    const L = lado === 'LONG' ? 1 : -1;
    if (!(p > 0)) return setErr('Indica el precio.');
    if (nueva && !(s > 0 && L * (p - s) > 0)) return setErr(`El SL de un ${lado} va ${L > 0 ? 'por debajo' : 'por encima'} de la entrada.`);
    if (nueva && t != null && !(L * (t - p) > 0)) return setErr(`El TP1 de un ${lado} va ${L > 0 ? 'por encima' : 'por debajo'} de la entrada.`);
    if (!(q > 0 && q <= 100)) return setErr('El porcentaje va de 1 a 100.');
    const cuando = new Date(fecha).toISOString();
    const ev: SwingEvento = { tipo, precio: p, porcentaje: q, fecha: cuando, nota: nota || null };
    setGuardando(true); setErr(null);
    try {
      if (nueva) {
        const o = await backend.swingCrear({ base, lado, setup: r.setup ?? null, entrada: p, sl: s, tp1: t, trailing: true, abierta_en: cuando, eventos: [ev], nota: nota || null });
        aviso(`Guardada: ${lado} en ${base} a ${fp(p, dec)}.`);
        onGuardado(o);
      } else {
        const o = r.op!;
        const eventos = [...o.eventos, ev];
        const salidas = eventos.filter((x) => x.tipo === 'salida').reduce((a, x) => a + x.porcentaje, 0);
        // varias entradas: la entrada pasa a ser el precio medio ponderado
        const ents = eventos.filter((x) => x.tipo === 'entrada');
        const entrada = ents.length ? ents.reduce((a, x) => a + x.precio * x.porcentaje, 0) / ents.reduce((a, x) => a + x.porcentaje, 0) : o.entrada;
        await backend.swingActualizar(o.id, { eventos, ...(tipo === 'entrada' ? { entrada } as Partial<SwingOperacion> : {}), cerrada_en: salidas >= 100 ? cuando : null });
        aviso(tipo === 'salida' ? (salidas >= 100 ? 'Operación cerrada y guardada.' : `Salida del ${q} % guardada.`) : 'Entrada añadida.');
        onGuardado();
      }
    } catch (x) { setErr((x as Error).message); } finally { setGuardando(false); }
  };
  return (
    <div className="dialog-back" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="sw-reg-t" onSubmit={guardar} noValidate>
        <header className="panel-h" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 id="sw-reg-t" style={{ fontSize: 16 }}>{nueva ? `Registrar mi entrada en ${base}` : `Registrar en ${base} · ${r.op!.lado}`}</h2>
          <button ref={cerrar} type="button" className="btn btn-sm icon-btn" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>
        </header>
        <div className="panel-b">
          {!nueva && (
            <div className="seg" role="group" aria-label="Tipo" style={{ display: 'flex' }}>
              {(['entrada', 'salida'] as const).map((t) => <button key={t} type="button" style={{ flex: 1 }} aria-pressed={tipo === t} onClick={() => { setTipo(t); setPorc(t === 'salida' ? '50' : '100'); }}>{t === 'entrada' ? 'Añadir entrada' : 'Salida'}</button>)}
            </div>
          )}
          {nueva && (
            <div className="seg" role="group" aria-label="Lado" style={{ display: 'flex' }}>
              {(['LONG', 'SHORT'] as const).map((l) => <button key={l} type="button" style={{ flex: 1 }} aria-pressed={lado === l} onClick={() => setLado(l)}>{l}</button>)}
            </div>
          )}
          <div className="sf-fila">
            <Campo etiqueta={tipo === 'salida' ? 'Precio de salida' : 'Precio de entrada'}><input className="input num" inputMode="decimal" value={precio} onChange={(e) => setPrecio(e.target.value)} /></Campo>
            <Campo etiqueta="Fecha y hora"><input className="input" type="datetime-local" value={fecha} onChange={(e) => setFecha(e.target.value)} /></Campo>
          </div>
          {nueva && (
            <div className="sf-fila">
              <Campo etiqueta="Stop loss"><input className="input num" inputMode="decimal" value={sl} onChange={(e) => setSl(e.target.value)} /></Campo>
              <Campo etiqueta="TP1 (cierra 50 %)"><input className="input num" inputMode="decimal" value={tp1} onChange={(e) => setTp1(e.target.value)} placeholder="opcional" /></Campo>
            </div>
          )}
          {!nueva && (
            <Campo etiqueta={tipo === 'salida' ? '% de la posición que cierras' : '% que añades (para el precio medio)'}>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="input-wrap" style={{ width: 110 }}><input className="input num" inputMode="decimal" value={porc} onChange={(e) => setPorc(e.target.value)} /><span className="suf">%</span></div>
                {tipo === 'salida' && [25, 50, 100].map((x) => <button key={x} type="button" className="chip" aria-pressed={porc === String(x)} onClick={() => setPorc(String(x))}>{x === 100 ? 'Todo' : `${x} %`}</button>)}
              </div>
            </Campo>
          )}
          <Campo etiqueta="Nota (opcional)"><input className="input" value={nota} maxLength={200} onChange={(e) => setNota(e.target.value)} placeholder="por qué entraste o saliste" /></Campo>
          {err && <Nota tono="warn">{err}</Nota>}
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn" onClick={onCerrar}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button>
        </div>
      </form>
    </div>
  );
}

export function Swing() {
  const { estado } = useSesion();
  const [moneda, setMoneda] = useState('BTC');
  const [pedida, setPedida] = useState('BTC');
  const [capital, setCapital] = useState('');
  const [selId, setSelId] = useState<number | null>(null);
  const [registro, setRegistro] = useState<Registro | null>(null);
  const [verCerradas, setVerCerradas] = useState(false);
  // móvil: gráfico compacto (menos velas, lienzo más estrecho y alto para que se lean las etiquetas)
  const [movil, setMovil] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 640px)').matches);
  useEffect(() => { const q = window.matchMedia('(max-width: 640px)'); const f = () => setMovil(q.matches); q.addEventListener('change', f); return () => q.removeEventListener('change', f); }, []);
  useEffect(() => { if (!capital && estado?.diario) setCapital(String(estado.diario.capital)); }, [estado, capital]);

  const ops = usePeticion(() => backend.swingListar(), [], { clave: 'swing:ops' });
  const lista = ops.datos ?? [];
  const abiertas = lista.filter((o) => !o.cerrada_en), cerradas = lista.filter((o) => o.cerrada_en);
  const rev = usePeticion(() => (abiertas.length ? backend.motor<InformeSwingRevisar>('swing_revisar', { operaciones: abiertas.map(paraMotor) }) : Promise.resolve({ ahora: Date.now(), evaluaciones: {} } as InformeSwingRevisar)), [abiertas.map((o) => `${o.id}:${o.sl}:${o.eventos.length}`).join()], { clave: `swing:rev:${abiertas.map((o) => `${o.id}:${o.sl}:${o.eventos.length}`).join()}` });
  const delaMoneda = abiertas.filter((o) => o.base === pedida);
  const an = usePeticion(() => backend.motor<InformeSwing>('swing', { moneda: pedida, capital: capital || undefined, operaciones: delaMoneda.map(paraMotor) }), [pedida, delaMoneda.map((o) => `${o.id}:${o.sl}:${o.eventos.length}`).join()], { clave: `swing:${pedida}:${delaMoneda.map((o) => `${o.id}:${o.sl}:${o.eventos.length}`).join()}` });
  const a = an.datos;
  const dec = a?.decimales ?? 2;
  // selId −1 = ver el plan de hoy aunque tengas una operación abierta en la moneda
  const sel = selId === -1 ? null : lista.find((o) => o.id === selId && o.base === pedida) ?? delaMoneda[0] ?? null;
  const evSel = sel ? (a?.evaluaciones?.[String(sel.id)] ?? rev.datos?.evaluaciones?.[String(sel.id)] ?? null) : null;

  const refrescar = () => { ops.run(); rev.run(); an.run(); };
  const guardado = (o?: SwingOperacion) => { setRegistro(null); ops.run(); if (o) setSelId(o.id); };
  const analizar = (e?: FormEvent) => { e?.preventDefault(); const m = moneda.trim().toUpperCase(); if (m) { setPedida(m); setSelId(null); } };
  const verOp = (o: SwingOperacion) => { setMoneda(o.base); setPedida(o.base); setSelId(o.id); };

  // niveles y marcas del gráfico: la operación elegida manda; si no hay, el plan de hoy o los niveles vigilados
  const { niveles, marcas, proyeccion, zona } = useMemo(() => {
    const nv: NivelGrafico[] = [], mk: MarcaGrafico[] = [];
    let pr = null, zn = null;
    if (sel && a) {
      const t0 = Date.parse(sel.abierta_en);
      nv.push({ clave: 'op-e', precio: sel.entrada, etiqueta: 'E', nombre: 'Tu entrada', tipo: 'entrada', desde: t0 });
      nv.push({ clave: 'op-sl', precio: sel.sl, etiqueta: 'SL', nombre: 'Tu stop loss', tipo: 'sl', desde: t0, tocado: evSel?.t_sl });
      if (sel.tp1 != null) nv.push({ clave: 'op-tp', precio: sel.tp1, etiqueta: 'TP1', nombre: 'Tu TP1 (cierra 50 %)', tipo: 'tp', desde: t0, tocado: evSel?.t_tp1 });
      if (evSel && evSel.sl_sugerido !== sel.sl) nv.push({ clave: 'op-tr', precio: evSel.sl_sugerido, etiqueta: 'SL→', nombre: 'SL sugerido (trailing)', tipo: 'trailing' });
      for (const x of sel.eventos) mk.push({ t: Date.parse(x.fecha), precio: x.precio, tipo: x.tipo === 'entrada' ? 'entrada' : 'salida', texto: `${x.tipo === 'entrada' ? 'Entrada' : `Salida ${x.porcentaje} %`} a ${fp(x.precio, dec)} · ${fechaHora(x.fecha)}${x.nota ? ` · ${x.nota}` : ''}` });
      if (evSel?.t_tp1 && sel.tp1 != null) mk.push({ t: evSel.t_tp1, precio: sel.tp1, tipo: 'toco_tp', texto: `Tocó el TP1 el ${fechaCorta(evSel.t_tp1)}` });
      if (evSel?.t_sl) mk.push({ t: evSel.t_sl, precio: sel.sl, tipo: 'toco_sl', texto: `Tocó el SL el ${fechaCorta(evSel.t_sl)}` });
      if (!evSel?.toco_tp1 && !evSel?.toco_sl && sel.tp1 != null) pr = { desde: a.ahora, precio: a.precio, tp1: sel.tp1, sl: sel.sl, dias_tp1: Math.max(2, (a.historiales[sel.setup ?? 'ruptura']?.dias_tp1_mediana ?? 12) - (evSel?.dias ?? 0)) };
    } else if (a?.plan) {
      const z = a.plan.zona_entrada.map((x) => x.precio);
      zn = { min: Math.min(...z), max: Math.max(...z) };
      nv.push({ clave: 'pl-e', precio: a.precio, etiqueta: 'E', nombre: 'Entrada (hoy)', tipo: 'entrada' });
      nv.push({ clave: 'pl-sl', precio: a.plan.sl, etiqueta: 'SL', nombre: 'Stop loss', tipo: 'sl' });
      nv.push({ clave: 'pl-tp', precio: a.plan.tp1, etiqueta: 'TP1', nombre: 'TP1 (cierra 50 %)', tipo: 'tp' });
      if (a.plan.trailing) nv.push({ clave: 'pl-tr', precio: a.plan.trailing.nivel_hoy, etiqueta: 'TS', nombre: `Trailing (mín./máx. de ${a.plan.trailing.dias} días)`, tipo: 'trailing' });
      pr = { desde: a.ahora, precio: a.precio, tp1: a.plan.tp1, sl: a.plan.sl, dias_tp1: a.plan.dias_tp1 ?? 12 };
    } else if (a) {
      a.vigilar.forEach((w, k) => {
        nv.push({ clave: `vg-${k}`, precio: w.precio, etiqueta: w.lado === 'LONG' ? '▲' : '▼', nombre: w.texto, tipo: 'vigilar' });
        nv.push({ clave: `vg-${k}-sl`, precio: w.plan.sl, etiqueta: 'SL?', nombre: `SL si se activa el ${w.lado}`, tipo: 'sl' });
        nv.push({ clave: `vg-${k}-tp`, precio: w.plan.tp1, etiqueta: 'TP1?', nombre: `TP1 si se activa el ${w.lado}`, tipo: 'tp' });
      });
    }
    return { niveles: nv, marcas: mk, proyeccion: pr, zona: zn };
  }, [sel, a, evSel, dec]);

  // pulsar una línea o marca: registrar a ese precio (si hay operación elegida, como evento; si no, nueva)
  const pulsar = (n: NivelGrafico | MarcaGrafico) => {
    if (!a) return;
    if (sel) { setRegistro({ modo: 'evento', op: sel, tipo: 'tipo' in n && ['tp', 'sl', 'trailing'].includes(n.tipo) ? 'salida' : 'entrada', lado: sel.lado, precio: n.precio }); return; }
    const w = 'clave' in n && n.clave.startsWith('vg-') ? a.vigilar[+n.clave.split('-')[1]] : null;
    const lado: Lado = w?.lado ?? (a.recomendacion === 'SHORT' ? 'SHORT' : 'LONG');
    setRegistro({ modo: 'nueva', tipo: 'entrada', lado, precio: w ? w.plan.entrada : n.precio, sl: w?.plan.sl ?? a.plan?.sl, tp1: w?.plan.tp1 ?? a.plan?.tp1 ?? null, setup: w?.setup ?? a.plan?.setup ?? a.setup });
  };
  const nuevaDesdePlan = () => a && setRegistro({ modo: 'nueva', tipo: 'entrada', lado: a.recomendacion === 'SHORT' ? 'SHORT' : 'LONG', precio: a.precio, sl: a.plan?.sl, tp1: a.plan?.tp1 ?? null, setup: a.plan?.setup ?? a.setup });

  const Ico = !a || a.recomendacion === 'ESPERAR' ? CircleSlash : a.recomendacion === 'LONG' ? ArrowUpRight : ArrowDownRight;
  const cargando = ops.cargando || an.cargando || rev.cargando;
  return (
    <Pagina titulo="Swing" acciones={<button className="btn btn-sm icon-btn" onClick={refrescar} disabled={cargando} aria-busy={cargando} aria-label={cargando ? 'Actualizando' : 'Actualizar'}><RefreshCw size={14} className={cargando ? 'girando' : undefined} aria-hidden /></button>}>
      <form className="panel" onSubmit={analizar} noValidate aria-label="Analizar una moneda para swing">
        <div className="panel-b sf-fila" style={{ alignItems: 'end' }}>
          <Campo etiqueta="Moneda"><SelectorMoneda valor={moneda} onCambio={setMoneda} placeholder="BTC" /></Campo>
          <Campo etiqueta="Capital" hint="Para el tamaño de la posición"><div className="input-wrap"><input className="input num" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} /><span className="suf">USDT</span></div></Campo>
          <div className="field"><button className="btn btn-primary" type="submit" disabled={an.cargando}>Analizar swing</button></div>
        </div>
        <p className="panel-b faint" style={{ fontSize: 12, paddingTop: 0 }}>Operaciones de días a semanas en velas diarias. El setup se elige con el historial real de 2 años de cada moneda (comisiones y funding incluidos). Riesgo por operación: 2 % del capital como mucho, apalancamiento bajo.</p>
      </form>

      {/* Mis operaciones */}
      <Panel titulo="Mis operaciones swing" aside={lista.length ? <span className="faint" style={{ fontSize: 12 }}>{abiertas.length} abiertas · {cerradas.length} cerradas</span> : null} flush>
        {ops.cargando && !ops.datos ? <div className="panel-b"><Esqueleto filas={2} /></div> : ops.error ? <div className="panel-b"><ErrorEstado mensaje={ops.error} reintentar={ops.run} /></div> : !abiertas.length ? (
          <div className="panel-b"><p className="muted" style={{ fontSize: 13 }}>Aún no tienes operaciones swing abiertas. Cuando entres en una, regístrala desde el plan o pulsando una línea del gráfico: quedará guardada y aquí verás si se acerca al TP1 o si rompió el SL.</p></div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {abiertas.map((o) => {
              const e = rev.datos?.evaluaciones?.[String(o.id)] ?? null;
              const activa = sel?.id === o.id;
              return (
                <li key={o.id} style={{ borderTop: '1px solid var(--line)', background: activa ? 'var(--accent-soft)' : undefined }}>
                  <button type="button" onClick={() => verOp(o)} className="sw-op" aria-current={activa ? 'true' : undefined}>
                    <span style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                      <b>{o.base}</b><LadoTag lado={o.lado} size={12} />
                      <span className="num muted" style={{ fontSize: 13 }}>entrada {fp(o.entrada, decDe(o.entrada))} · {fechaCorta(o.abierta_en)}{e ? ` · día ${e.dias}` : ''}</span>
                      {e && <span className={`tag ${ACCION_TONO[e.accion]}`}>{e.accion}</span>}
                      {e && <span className={`num ${e.resultado_pct >= 0 ? 'gain' : 'loss'}`} style={{ marginLeft: 'auto', fontWeight: 700 }}>{pctSigno(e.resultado_pct)}</span>}
                    </span>
                    {e ? <span className="faint" style={{ fontSize: 12, display: 'block', textAlign: 'left' }}>{e.motivo}</span> : rev.cargando ? <span className="faint" style={{ fontSize: 12 }}>Revisando…</span> : null}
                    <Camino o={o} e={e} dec={decDe(o.entrada)} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {cerradas.length > 0 && (
          <div className="panel-b" style={{ borderTop: '1px solid var(--line)' }}>
            <button type="button" className="link-btn" onClick={() => setVerCerradas(!verCerradas)} aria-expanded={verCerradas} style={{ fontSize: 13 }}>Cerradas ({cerradas.length}) {verCerradas ? '▲' : '▼'}</button>
            {verCerradas && <ul className="list" style={{ marginTop: 8 }}>{cerradas.map((o) => {
              const sal = o.eventos.filter((x) => x.tipo === 'salida'), L = o.lado === 'LONG' ? 1 : -1;
              const res = sal.reduce((s, x) => s + (x.porcentaje / 100) * ((100 * L * (x.precio - o.entrada)) / o.entrada), 0);
              return <li key={o.id}><span className="num">{o.base} {o.lado} · {fechaCorta(o.abierta_en)} → {o.cerrada_en ? fechaCorta(o.cerrada_en) : '—'} · <b className={res >= 0 ? 'gain' : 'loss'}>{pctSigno(res)}</b></span></li>;
            })}</ul>}
          </div>
        )}
      </Panel>

      {an.cargando && !a ? <div className="grid g-main"><Esqueleto filas={6} /><Esqueleto filas={4} /></div> : an.error ? <ErrorEstado mensaje={an.error} reintentar={an.run} /> : !a ? (
        <div className="panel"><Vacio icono={<TrendingUp size={28} aria-hidden />} titulo="Elige una moneda">Analiza una moneda para ver el setup de swing que funciona en ella, los puntos de entrada y salida y el gráfico.</Vacio></div>
      ) : (
        <>
          <section className="panel" aria-label="Veredicto swing">
            <div className="verdict">
              <span className={`verdict-word ${a.recomendacion === 'LONG' ? 'long' : a.recomendacion === 'SHORT' ? 'short' : 'none'}`}><Ico size={34} strokeWidth={2.4} aria-hidden />{a.recomendacion}</span>
              <div className="verdict-meta">
                <span className="t1">{a.base} · swing {a.setup ? `· ${a.setups[a.setup]?.nombre}` : ''}</span>
                <span className="t2 num">precio {fp(a.precio, dec)} · tendencia {a.tendencia.toLowerCase()} · ATR diario {pct(a.indicadores.atr_pct, 2)}</span>
              </div>
              <div className="tags">{a.recomendacion !== 'ESPERAR' && <NivelTag nivel={a.nivel} />}</div>
            </div>
            <div className="panel-b" style={{ display: 'grid', gap: 10 }}>
              {(a as InformeSwing & { demo_nota?: string | null }).demo_nota && <Nota tono="warn">{(a as InformeSwing & { demo_nota?: string | null }).demo_nota}</Nota>}
              <p style={{ fontSize: 14 }}>{a.texto}</p>
              {sel && <Nota tono="info" titulo={`Viendo tu operación ${sel.lado} del ${fechaCorta(sel.abierta_en)}.`}>Las líneas del gráfico son las tuyas. <button type="button" className="link-btn" onClick={() => setSelId(-1)}>Ver el plan de hoy</button></Nota>}
            </div>
          </section>

          <Panel titulo={`Gráfico diario de ${a.base}`} aside={<span className="faint" style={{ fontSize: 12 }}>pulsa una línea o marca para registrar</span>}>
            <div style={{ display: 'grid', gap: 10 }}>
              <GraficoSwing velas={a.velas.slice(movil ? -60 : -120)} medias={a.medias.slice(movil ? -60 : -120)} niveles={niveles} marcas={marcas} proyeccion={proyeccion} zona={zona} dec={dec} onNivel={pulsar} ancho={movil ? 440 : 960} alto={movil ? 460 : 420} diasFuturo={movil ? 15 : 25} />
              <div className="prob-legend" style={{ fontSize: 12 }}>
                <span><i className="sw" style={{ background: 'var(--accent)' }} aria-hidden />media 20 d / entrada</span>
                <span><i className="sw" style={{ background: 'var(--warn)' }} aria-hidden />media 50 d / trailing</span>
                <span><i className="sw" style={{ background: 'var(--text-3)' }} aria-hidden />media 200 d</span>
                <span><i className="sw" style={{ background: 'var(--gain)' }} aria-hidden />TP1 y proyección</span>
                <span><i className="sw" style={{ background: 'var(--loss)' }} aria-hidden />SL</span>
              </div>
            </div>
          </Panel>

          <div className="grid g-2">
            {sel ? (
              <Panel titulo="Seguimiento de tu operación" aside={evSel ? <span className={`tag ${ACCION_TONO[evSel.accion]}`}>{evSel.accion}</span> : null}>
                {evSel ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    <p style={{ fontSize: 14 }}>{evSel.motivo}</p>
                    <Camino o={sel} e={evSel} dec={dec} />
                    <KV items={[
                      { k: 'Resultado', v: pctSigno(evSel.resultado_pct), s: `${conSigno(evSel.r_actual)} R` },
                      { k: 'Días', v: String(evSel.dias), s: 'máximo 30' },
                      { k: 'Abierto', v: pct(evSel.abierto_pct, 0), s: 'de la posición' },
                      { k: 'SL sugerido', v: fp(evSel.sl_sugerido, dec), s: evSel.sl_sugerido !== sel.sl ? 'muévelo aquí' : 'sin cambios' },
                    ]} />
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn btn-primary" onClick={() => setRegistro({ modo: 'evento', op: sel, tipo: 'salida', lado: sel.lado, precio: evSel.precio })}>Registrar salida</button>
                      <button className="btn" onClick={() => setRegistro({ modo: 'evento', op: sel, tipo: 'entrada', lado: sel.lado, precio: evSel.precio })}><PlusCircle size={16} aria-hidden />Añadir entrada</button>
                      {evSel.sl_sugerido !== sel.sl && <button className="btn" onClick={async () => { await backend.swingActualizar(sel.id, { sl: evSel.sl_sugerido }); ops.run(); }}>Aplicar SL {fp(evSel.sl_sugerido, dec)}</button>}
                      <button className="btn btn-ghost" onClick={async () => { if (window.confirm('¿Borrar esta operación del registro? No se puede deshacer.')) { await backend.swingBorrar(sel.id); setSelId(null); ops.run(); } }}><Trash2 size={16} aria-hidden />Borrar</button>
                    </div>
                    {sel.eventos.length > 0 && <ul className="list" aria-label="Registro">{sel.eventos.map((x, k) => <li key={k} className="num">{fechaHora(x.fecha)} · {x.tipo === 'entrada' ? 'Entrada' : 'Salida'} {x.porcentaje} % a {fp(x.precio, dec)}{x.nota ? ` · ${x.nota}` : ''}</li>)}</ul>}
                  </div>
                ) : <Esqueleto filas={3} />}
              </Panel>
            ) : a.plan ? (
              <Panel titulo={`Plan ${a.recomendacion}`} aside={<span className="faint" style={{ fontSize: 12 }}>{a.setups[a.plan.setup]?.nombre}</span>}>
                <div style={{ display: 'grid', gap: 12 }}>
                  <Filas items={[
                    { k: 'Zona de entrada (escalonada)', v: a.plan.zona_entrada.map((z) => `${fp(z.precio, dec)} (${z.reparto} %)`).join(' · ') },
                    { k: 'Stop loss', v: `${fp(a.plan.sl, dec)} · ${pct(a.plan.sl_pct, 2)}`, cls: 'loss' },
                    { k: `TP1 (cierra ${a.plan.tp1_cierra_pct} %)`, v: fp(a.plan.tp1, dec), cls: 'gain' },
                    ...(a.plan.trailing ? [{ k: 'El resto', v: a.plan.trailing.texto }] : []),
                    { k: 'Tiempo', v: `TP1 en ~${a.plan.dias_tp1 ?? '—'} días · máximo ${a.plan.dias_max}` },
                    { k: 'Apalancamiento · margen', v: `${a.plan.apalancamiento}x · ${usdt(a.plan.margen)}` },
                    { k: 'Si salta el SL', v: usdt(-a.plan.riesgo_usdt), cls: 'loss' },
                    ...(a.plan.funding_estimado_usdt != null ? [{ k: 'Funding estimado', v: `${a.plan.funding_paga ? 'pagas' : 'cobras'} ~${usdt(a.plan.funding_estimado_usdt)}` }] : []),
                  ]} />
                  <button className="btn btn-primary" onClick={nuevaDesdePlan}><PlusCircle size={16} aria-hidden />Entré: registrar mi entrada</button>
                </div>
              </Panel>
            ) : (
              <Panel titulo="Niveles a vigilar" aside={<span className="faint" style={{ fontSize: 12 }}>planes si se activan</span>}>
                {a.vigilar.length ? (
                  <div style={{ display: 'grid', gap: 12 }}>
                    {a.vigilar.map((w, k) => (
                      <div key={k} style={{ display: 'grid', gap: 8, paddingBottom: 10, borderBottom: '1px solid var(--line)' }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}><LadoTag lado={w.lado} size={12} /><span style={{ fontSize: 14 }}>{w.texto}</span><span className="faint num" style={{ marginLeft: 'auto', fontSize: 12 }}>{pctSigno(w.dist_pct)}</span></div>
                        <Filas items={[
                          { k: 'Entrada', v: fp(w.plan.entrada, dec) },
                          { k: 'Stop loss', v: `${fp(w.plan.sl, dec)} · ${pct(w.plan.sl_pct, 2)}`, cls: 'loss' },
                          { k: `TP1 (${w.plan.r_tp1}R, cierra 50 %)`, v: `${fp(w.plan.tp1, dec)} · ${pct(w.plan.tp1_pct, 2)}`, cls: 'gain' },
                          { k: 'Tiempo', v: `TP1 en ~${w.plan.dias_tp1 ?? '—'} días · media ${w.plan.dias_medio ?? '—'} días` },
                        ]} />
                        <button className="btn btn-sm" onClick={() => setRegistro({ modo: 'nueva', tipo: 'entrada', lado: w.lado, precio: w.plan.entrada, sl: w.plan.sl, tp1: w.plan.tp1, setup: w.setup })}><PlusCircle size={14} aria-hidden />Si entro, registrarla</button>
                      </div>
                    ))}
                    <p className="faint" style={{ fontSize: 12 }}>La entrada de la ruptura es al CIERRE diario más allá del nivel, no al tocarlo.</p>
                  </div>
                ) : <p className="muted">Ningún setup gana ahora en {a.base}: no hay niveles que vigilar. Prueba otra moneda.</p>}
                {a.vigilar.length === 0 && <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={nuevaDesdePlan}><PlusCircle size={14} aria-hidden />Registrar una entrada mía</button>}
              </Panel>
            )}

            <Panel titulo={`Historial real en ${a.base} (2 años)`} flush>
              <div className="table-wrap"><table className="t">
                <thead><tr><th scope="col">Setup</th><th scope="col" className="r">Resultado</th><th scope="col" className="r hide-sm">Aciertos</th><th scope="col" className="r hide-sm">Días</th><th scope="col" className="r">1.ª / 2.ª mitad</th></tr></thead>
                <tbody>{Object.values(a.historiales).map((h) => (
                  <tr key={h.setup} style={h.setup === a.setup ? { background: 'var(--accent-soft)' } : undefined}>
                    <td>{a.setups[h.setup]?.nombre}<div className="faint" style={{ fontSize: 12 }}>{h.n} operaciones</div></td>
                    <td className={`r num strong ${(h.r_medio ?? 0) > 0 ? 'gain' : 'loss'}`}>{h.r_medio == null ? '—' : `${conSigno(h.r_medio)} R`}</td>
                    <td className="r num hide-sm">{h.acierto_pct == null ? '—' : pct(h.acierto_pct, 0)}</td>
                    <td className="r num hide-sm">{h.dias_medio ?? '—'}</td>
                    <td className="r num muted">{numero(h.r_mitad1, 2)} / {numero(h.r_mitad2, 2)}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              <p className="panel-b faint" style={{ fontSize: 12 }}>R = lo que arriesgas. Con comisiones y funding en contra. Un setup solo se usa si gana en total y en las dos mitades del periodo.</p>
            </Panel>
          </div>
        </>
      )}
      {registro && <ModalRegistro r={registro} base={registro.op?.base ?? pedida} dec={dec} onCerrar={() => setRegistro(null)} onGuardado={guardado} />}
    </Pagina>
  );
}
