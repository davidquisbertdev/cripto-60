import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Activity, BookCheck, Clock, Info, RefreshCw, ShieldAlert, X } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { Campo, ErrorEstado, Esqueleto, Filas, KV, LadoTag, Nota, Panel, Vacio } from '../components/ui';
import { BarraProb, COL, Escalera, Reloj } from '../components/graficos';
import { SelectorMoneda } from '../components/SelectorMoneda';
import { backend } from '../lib/api';
import { useSesion } from '../lib/sesion';
import { conSigno, estrategiaNombre, hace, hora, numero, precio as fp, usdtSigno } from '../lib/formato';
import type { EvalPosicion, Lado, PosicionGuardada } from '../lib/tipos';

// % que cierra cada TP por defecto según cuántos hay
const REPARTO: Record<number, number[]> = { 1: [100], 2: [50, 50], 3: [50, 25, 25] };
const claseAccion =(a: string) => (a.startsWith('MANTENER') ? 'keep' : a === 'REDUCIR' ? 'reduce' : a.startsWith('CERRAR') ? 'close' : 'done');

export function Posicion() {
  const { estado, refrescar } = useSesion();
  const abierta = estado?.posicion_abierta ?? null;
  const [ev, setEv] = useState<EvalPosicion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [auto, setAuto] = useState(false);
  const [cerrar, setCerrar] = useState(false);
  const [manual, setManual] = useState<Record<string, unknown> | null>(null);

  const revisar = async (p: PosicionGuardada | Record<string, unknown>, esManual = false) => {
    setCargando(true); setError(null);
    if (esManual) setManual(p as Record<string, unknown>);
    try {
      const g = p as PosicionGuardada;
      const params = 'id' in p && !esManual
        ? { moneda: g.base, lado: g.lado, entrada: g.entrada, sl: g.sl, tp1: g.tps[0], tp2: g.tps[1], tp3: g.tps[2], contratos: g.contratos ?? undefined, abierta: g.abierta, estrategia: g.estrategia, duracion: g.duracion_max_min ?? undefined }
        : { ...p, manual: true };
      setEv(await backend.motor<EvalPosicion>('posicion', params));
    } catch (x) { setError((x as Error).message); }
    finally { setCargando(false); }
  };

  useEffect(() => { if (abierta) revisar(abierta); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [abierta?.id]);
  useEffect(() => {
    if (!auto || !abierta) return;
    const i = setInterval(() => revisar(abierta), 60e3);
    return () => clearInterval(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auto, abierta?.id]);

  const dejar = async () => { if (abierta) { await backend.cerrarPosicion(abierta.id); setEv(null); await refrescar(); } };
  // Más (o menos) tiempo para esta operación: se guarda en la posición seguida y se revisa con él.
  const cambiarDuracion = async (min: number) => {
    if (abierta) {
      try { await backend.duracionPosicion(abierta.id, min); } catch (x) { setError((x as Error).message); return; }
      await refrescar();
      await revisar({ ...abierta, duracion_max_min: min });
    } else if (manual) await revisar({ ...manual, duracion: min }, true);
  };

  return (
    <Pagina titulo="Posición" acciones={abierta && (
      <>
        <label className="faint" style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />Revisar cada minuto</label>
        <button className="btn btn-sm" onClick={() => revisar(abierta)} disabled={cargando}><RefreshCw size={14} aria-hidden />{cargando ? 'Revisando…' : 'Revisar ahora'}</button>
      </>
    )}>
      {!abierta && !ev && !cargando && <SinPosicion onRevisar={(p) => revisar(p, true)} />}
      {cargando && !ev ? <div className="grid g-main"><Esqueleto filas={5} /><Esqueleto filas={5} /></div>
        : error ? <ErrorEstado mensaje={error} reintentar={abierta ? () => revisar(abierta) : undefined} />
          : ev ? <Evaluacion ev={ev} seguida={!!abierta} cargando={cargando} onCerrar={() => setCerrar(true)} onDejar={dejar} onOtra={() => { setEv(null); setManual(null); }} onDuracion={cambiarDuracion} /> : null}
      {cerrar && ev && abierta && <DialogoCierre ev={ev} pos={abierta} onFin={async (ok) => { setCerrar(false); if (ok) { setEv(null); await refrescar(); } }} />}
    </Pagina>
  );
}

function Duracion({ actual, transcurrido, cargando, onAplicar }: { actual: number; transcurrido: number; cargando: boolean; onAplicar: (min: number) => void }) {
  const [v, setV] = useState(String(actual));
  useEffect(() => setV(String(actual)), [actual]);
  const n = Number(v);
  const valido = Number.isFinite(n) && n >= 5 && n <= 1440;
  const sugeridos = [60, 90, 120, 180, 240].filter((x) => x !== actual && x > transcurrido);
  const aplicar = (e?: FormEvent) => { e?.preventDefault(); if (valido && n !== actual) onAplicar(Math.round(n)); };
  return (
    <form className="panel-b duracion" onSubmit={aplicar} noValidate>
      <Campo etiqueta="Duración máxima de esta operación" hint={valido && n <= transcurrido ? `Ya llevas ${transcurrido} min: con ${n} min la revisión dirá que cierres.` : 'El reloj, la espera del TP1 y las probabilidades se recalculan con ella.'}>
        <div className="form-row" style={{ alignItems: 'center' }}>
          <div className="input-wrap" style={{ flex: '0 1 140px' }}><input className="input num" type="number" min={5} max={1440} step={5} value={v} onChange={(e) => setV(e.target.value)} aria-invalid={!valido || undefined} /><span className="suf">min</span></div>
          <button type="submit" className="btn btn-sm" disabled={!valido || n === actual || cargando}><Clock size={14} aria-hidden />{cargando ? 'Revisando…' : 'Aplicar'}</button>
          <div className="chips" role="group" aria-label="Duraciones rápidas">{sugeridos.map((x) => <button type="button" key={x} className="chip" onClick={() => onAplicar(x)} disabled={cargando}>{x} min</button>)}</div>
        </div>
      </Campo>
    </form>
  );
}

function Evaluacion({ ev, seguida, cargando, onCerrar, onDejar, onOtra, onDuracion }: { ev: EvalPosicion; seguida: boolean; cargando: boolean; onCerrar: () => void; onDejar: () => void; onOtra: () => void; onDuracion: (min: number) => void }) {
  const p = ev.posicion, dec = ev.decimales;
  const pnl = ev.pnl ? ev.pnl.realizado + ev.pnl.flotante : null;
  const terminada = !!ev.recorrido.cierre;
  // Las horas límite las da el Reloj (misma zona y formato); los pasos del motor que las repiten se omiten
  const pasos = ev.pasos.filter((x) => !/^Te quedan|^Cierre total como mucho|^Tiempo cumplido/.test(x));
  return (
    <div className="grid g-main ordenar">
      <div className="stack">
        <section className="panel ord-1" aria-label="Qué hacer ahora">
          <div className="action">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <LadoTag lado={p.lado} /><span className="muted">{ev.base} · {estrategiaNombre(p.estrategia)} · abierta {hace(p.abierta, ev.ahora)}</span>
            </div>
            <div className={`action-word ${claseAccion(ev.accion)}`} aria-live="polite">{ev.accion}</div>
            <p>{ev.motivo}</p>
            {pasos.length > 0 && <ul className="list" style={{ marginTop: 6 }}>{pasos.map((x) => <li key={x}><Info size={14} aria-hidden />{x}</li>)}</ul>}
          </div>
          <KV items={[
            { k: 'Precio ahora', v: fp(ev.precio, dec), s: `entrada ${fp(p.entrada, dec)}` },
            { k: 'Resultado', v: pnl != null ? usdtSigno(pnl) : `${conSigno(ev.r_actual)} R`, s: pnl != null ? `${conSigno(ev.r_actual)} R` : 'sin contratos indicados', cls: (pnl ?? ev.r_actual) >= 0 ? 'gain' : 'loss' },
            { k: 'TP tocados', v: `${ev.recorrido.hit} de ${p.tps.length}`, s: `stop en ${fp(ev.recorrido.stop, dec)}${p.reparto?.length ? ` · cierra ${p.reparto.map((x) => numero(x, 0)).join(' · ')} %` : ''}` },
            { k: 'Tiempo', v: `${ev.transcurrido_min} min`, s: `máximo ${p.duracion_max_min} min${ev.recorrido.hit === 0 ? ` · TP1 hasta ${p.espera_max_min}` : ''}` },
          ]} />
          {!terminada && <Duracion actual={p.duracion_max_min} transcurrido={ev.transcurrido_min} cargando={cargando} onAplicar={onDuracion} />}
          <div className="panel-b" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {seguida ? (
              <>
                <button className="btn btn-primary" onClick={onCerrar}><BookCheck size={16} aria-hidden />Cerré: registrar resultado</button>
                <button className="btn btn-ghost" onClick={onDejar}><X size={16} aria-hidden />Dejar de seguir</button>
              </>
            ) : <button className="btn" onClick={onOtra}>Revisar otra posición</button>}
          </div>
        </section>

        <div className="grid g-2 ord-4">
          <Panel titulo="El análisis ahora">
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 10 }}><LadoTag lado={ev.analisis.sesgo} /><span className="muted num">{ev.analisis.nivel} · {ev.analisis.confianza}/100</span></div>
            <ul className="list">{ev.analisis.razones.slice(0, 5).map((r) => <li key={r}><Info size={14} aria-hidden />{r}</li>)}</ul>
          </Panel>
          <Panel titulo="BTC y ballenas">
            <Filas items={[
              { k: 'BTC', v: ev.btc ? `${ev.btc.lectura} · ${ev.btc.estado}` : '—', cls: ev.btc?.en_contra ? 'loss' : ev.btc?.estado === 'a favor' ? 'gain' : '' },
              { k: 'Ballenas', v: ev.ballenas ? `${ev.ballenas.lectura}${ev.ballenas.en_contra ? ' · en contra' : ''}` : '—', cls: ev.ballenas?.en_contra ? 'loss' : '' },
            ]} />
            {ev.btc?.texto && <p className="muted" style={{ marginTop: 10, fontSize: 13 }}>{ev.btc.texto}</p>}
          </Panel>
        </div>
        {ev.noticias_nuevas.length > 0 && (
          <Panel titulo="Noticias desde que abriste" className="ord-5">
            <ul className="list">{ev.noticias_nuevas.map((n) => <li key={n.titulo}><ShieldAlert size={14} aria-hidden className={n.sentimiento < 0 ? 'loss' : ''} />{hora(n.fecha)} · {n.titulo}</li>)}</ul>
          </Panel>
        )}
      </div>

      <div className="stack">
        {!terminada && (
          <Panel titulo="Reloj" flush className="ord-2">
            <Reloj desde={p.abierta} hitos={[
              ...(ev.recorrido.hit === 0 ? [{ que: 'Sin TP1, cierra', a: p.abierta + p.espera_max_min * 60e3 }] : []),
              { que: 'Cierre total', a: p.abierta + p.duracion_max_min * 60e3 },
            ]} />
          </Panel>
        )}
        <Panel titulo="Niveles" className="ord-3">
          <Escalera lado={p.lado} entrada={p.entrada} sl={p.sl} tps={p.tps} actual={ev.precio} dec={dec} tocados={ev.recorrido.hit} />
        </Panel>
        {ev.prob_siguiente_tp != null && ev.prob_stop != null && (
          <Panel titulo="Desde aquí" className="ord-3">
            <BarraProb partes={[{ que: ev.siguiente ?? 'TP', v: ev.prob_siguiente_tp, color: COL.gain }, { que: 'Stop', v: ev.prob_stop, color: COL.loss }, { que: 'Ninguno', v: Math.max(0, 100 - ev.prob_siguiente_tp - ev.prob_stop), color: COL.neutro }]} />
          </Panel>
        )}
      </div>
    </div>
  );
}

function SinPosicion({ onRevisar }: { onRevisar: (p: Record<string, unknown>) => void }) {
  const { estado } = useSesion();
  const [f, setF] = useState({ moneda: '', lado: 'LONG' as Lado, entrada: '', sl: '', tp1: '', tp2: '', tp3: '', hace: '', duracion: '' });
  const [nTps, setNTps] = useState(3);
  const [reparto, setReparto] = useState<string[]>(REPARTO[3].map(String));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: k === 'moneda' ? e.target.value.toUpperCase() : e.target.value });
  const cambiarN = (n: number) => { setNTps(n); setReparto(REPARTO[n].map(String)); };
  const rep = reparto.slice(0, nTps).map((x) => Number(x.replace(',', '.')));
  const suma = rep.reduce((x, y) => x + (Number.isFinite(y) ? y : 0), 0);
  const tpK = ['tp1', 'tp2', 'tp3'] as const;
  const enviar = (e: FormEvent) => {
    e.preventDefault();
    if (!f.moneda || !f.entrada || !f.sl) { setErr('Faltan la moneda, la entrada o el SL.'); return; }
    const falta = tpK.slice(0, nTps).findIndex((k) => !f[k]);
    if (falta >= 0) { setErr(`Falta el precio del TP${falta + 1}.`); return; }
    if (f.duracion && !(Number(f.duracion) >= 5 && Number(f.duracion) <= 1440)) { setErr('La duración máxima va de 5 a 1440 minutos.'); return; }
    if (rep.some((x) => !(x > 0)) || Math.abs(suma - 100) > 0.01) { setErr(`Los porcentajes de cierre deben ser mayores que 0 y sumar 100 % (ahora suman ${numero(suma, 0)} %).`); return; }
    setErr(null);
    onRevisar({
      moneda: f.moneda, lado: f.lado.toLowerCase(), entrada: f.entrada, sl: f.sl,
      tp1: f.tp1, tp2: nTps >= 2 ? f.tp2 : undefined, tp3: nTps >= 3 ? f.tp3 : undefined,
      reparto: rep, hace: f.hace ? `${f.hace}m` : undefined, duracion: f.duracion ? Number(f.duracion) : undefined,
    });
  };
  return (
    <div className="grid g-main">
      <div className="panel">
        <Vacio icono={<Activity size={28} aria-hidden />} titulo="No sigues ninguna posición" accion={<Link className="btn btn-primary" to="/senal">Pedir una señal</Link>}>
          Cuando entres desde una señal, pulsa «Entré: seguir la posición» y aquí verás cada minuto si mantener, mover el SL, reducir o cerrar.
        </Vacio>
      </div>
      <Panel titulo="Revisar una posición a mano">
        <form onSubmit={enviar} style={{ display: 'grid', gap: 12 }} noValidate>
          <div className="form-row">
            <Campo etiqueta="Moneda"><SelectorMoneda valor={f.moneda} onCambio={(m) => setF((x) => ({ ...x, moneda: m }))} placeholder="SOL" /></Campo>
            <div className="field"><span>Lado</span>
              <div className="seg" role="group" aria-label="Lado">{(['LONG', 'SHORT'] as Lado[]).map((l) => <button type="button" key={l} aria-pressed={f.lado === l} onClick={() => setF({ ...f, lado: l })}>{l}</button>)}</div>
            </div>
          </div>
          <div className="form-row">
            <Campo etiqueta="Entrada"><input className="input num" inputMode="decimal" value={f.entrada} onChange={set('entrada')} /></Campo>
            <Campo etiqueta="Stop loss"><input className="input num" inputMode="decimal" value={f.sl} onChange={set('sl')} /></Campo>
          </div>
          <div className="field"><span>Take profits</span>
            <div className="seg" role="group" aria-label="Número de take profits">{[1, 2, 3].map((n) => <button type="button" key={n} aria-pressed={nTps === n} onClick={() => cambiarN(n)}>{n} TP</button>)}</div>
          </div>
          {tpK.slice(0, nTps).map((k, i) => (
            <div className="form-row" key={k}>
              <Campo etiqueta={`Precio TP${i + 1}`}><input className="input num" inputMode="decimal" value={f[k]} onChange={set(k)} /></Campo>
              <Campo etiqueta={`TP${i + 1} cierra`}>
                <div className="input-wrap"><input className="input num" inputMode="decimal" value={reparto[i]} onChange={(e) => setReparto(reparto.map((x, j) => (j === i ? e.target.value : x)))} aria-invalid={Math.abs(suma - 100) > 0.01 || undefined} /><span className="suf">%</span></div>
              </Campo>
            </div>
          ))}
          <span className={`hint ${Math.abs(suma - 100) > 0.01 ? 'warn' : 'faint'}`} style={{ fontSize: 12 }}>
            {nTps === 1 ? 'Un solo TP cierra el 100 %.' : `Cierras ${rep.map((x) => `${numero(x, 0)} %`).join(' + ')} = ${numero(suma, 0)} %${Math.abs(suma - 100) > 0.01 ? ' (debe sumar 100 %)' : ''}. Tras el TP1, el SL pasa a la entrada.`}
          </span>
          <div className="form-row">
            <Campo etiqueta="Abierta hace (min)"><input className="input num" inputMode="numeric" value={f.hace} onChange={set('hace')} placeholder="0" /></Campo>
            <Campo etiqueta="Duración máxima (min)"><input className="input num" inputMode="numeric" value={f.duracion} onChange={set('duracion')} placeholder={estado?.cfg ? String(estado.cfg.duracion_max_min) : '60'} /></Campo>
          </div>
          {err && <Nota tono="warn">{err}</Nota>}
          <button className="btn" type="submit">Revisar</button>
        </form>
      </Panel>
    </div>
  );
}

function DialogoCierre({ ev, pos, onFin }: { ev: EvalPosicion; pos: PosicionGuardada; onFin: (ok: boolean) => void }) {
  const { aviso } = useSesion();
  const sugerido = ev.pnl ? +(ev.pnl.realizado + ev.pnl.flotante).toFixed(3) : '';
  const [pnl, setPnl] = useState(String(sugerido));
  const [nota, setNota] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === 'Escape' && onFin(false); window.addEventListener('keydown', k); return () => window.removeEventListener('keydown', k); }, [onFin]);
  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(pnl.replace(',', '.'));
    if (!Number.isFinite(n)) { setErr('Escribe cuánto ganaste o perdiste en USDT (negativo si perdiste).'); return; }
    setGuardando(true);
    try {
      await backend.registrar({ simbolo: pos.base, lado: pos.lado, pnl: n, nota: nota || null, senal_id: pos.senal_id });
      await backend.cerrarPosicion(pos.id);
      aviso(`Registrado: ${usdtSigno(n)}`);
      onFin(true);
    } catch (x) { setErr((x as Error).message); setGuardando(false); }
  };
  return (
    <div className="dialog-back" onClick={(e) => e.target === e.currentTarget && onFin(false)}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby="cierre-t" onSubmit={guardar}>
        <header className="panel-h"><h2 id="cierre-t">Registrar el cierre de {pos.base}</h2></header>
        <div className="panel-b">
          <Campo etiqueta="Resultado en USDT" hint={sugerido !== '' ? `Según el precio actual: ${usdtSigno(Number(sugerido))}. Usa el de tu exchange, con comisiones.` : 'El que te muestra tu exchange, con comisiones.'} error={err}>
            <input className="input num" inputMode="decimal" autoFocus value={pnl} onChange={(e) => setPnl(e.target.value)} />
          </Campo>
          <Campo etiqueta="Nota (opcional)"><input className="input" value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} placeholder="Qué aprendiste" /></Campo>
          <p className="faint" style={{ fontSize: 13 }}>Con 2 pérdidas seguidas hay pausa de 30 min y riesgo a la mitad; con 4, o un 20 % perdido en el día, se para hasta mañana.</p>
        </div>
        <div className="dialog-actions">
          <button type="button" className="btn btn-ghost" onClick={() => onFin(false)}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Registrar y cerrar'}</button>
        </div>
      </form>
    </div>
  );
}
