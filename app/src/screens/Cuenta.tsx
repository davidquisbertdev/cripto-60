// Diario, Ajustes y Letra pequeña.
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { BookOpen, Download, Plus, Trash2 } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { Campo, ErrorEstado, Esqueleto, Filas, KV, LadoTag, Nota, Panel, Vacio } from '../components/ui';
import { CurvaCapital } from '../components/graficos';
import { backend, reiniciarDemo } from '../lib/api';
import { useSesion } from '../lib/sesion';
import { usePeticion } from '../lib/usar';
import { diaClave, nombreExchange, fechaCorta, fechaHora, pct, tono, usdt, usdtSigno, zonaNavegador } from '../lib/formato';
import type { Ajustes as TAjustes, Lado } from '../lib/tipos';

// ---------------- Diario ----------------
export function Diario() {
  const { estado, refrescar, aviso } = useSesion();
  const r = usePeticion(() => backend.operaciones(), []);
  const d = estado?.diario;
  const ops = r.datos ?? [];
  const puntos = useMemo(() => {
    let c = d?.capital_inicial ?? 0;
    return [...ops].reverse().map((o) => ({ t: Date.parse(o.fecha), capital: (c += o.pnl), pnl: o.pnl, simbolo: o.simbolo }));
  }, [ops, d?.capital_inicial]);
  const dias = useMemo(() => {
    const m = new Map<string, { t: number; pnl: number; n: number; g: number }>();
    for (const o of ops) { const k = diaClave(o.fecha); const x = m.get(k) ?? { t: Date.parse(o.fecha), pnl: 0, n: 0, g: 0 }; x.pnl += o.pnl; x.n++; if (o.pnl > 0) x.g++; m.set(k, x); }
    return [...m.values()].slice(0, 7);
  }, [ops]);
  const borrar = async (id: number) => { await backend.borrar(id); await Promise.all([r.run(), refrescar()]); aviso('Operación borrada'); };
  const exportar = () => {
    const csv = ['fecha,simbolo,lado,pnl_usdt,margen,nota', ...ops.map((o) => [o.fecha, o.simbolo, o.lado ?? '', o.pnl, o.margen ?? '', `"${(o.nota ?? '').replace(/"/g, '""')}"`].join(','))].join('\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'diario-cripto60.csv'; a.click(); URL.revokeObjectURL(a.href);
  };

  return (
    <Pagina titulo="Diario" acciones={ops.length > 0 && <button className="btn btn-sm" onClick={exportar}><Download size={14} aria-hidden />Exportar CSV</button>}>
      {d?.bloqueo && <Nota tono="loss" titulo="Freno activo.">{d.bloqueo}</Nota>}
      {d && (
        <section className="panel" aria-label="Resumen">
          <KV items={[
            { k: 'Capital', v: usdt(d.capital, 2), s: `inicial ${usdt(d.capital_inicial, 2)}` },
            { k: 'Resultado', v: usdtSigno(d.capital - d.capital_inicial), cls: d.capital >= d.capital_inicial ? 'gain' : 'loss', s: pct((100 * (d.capital - d.capital_inicial)) / d.capital_inicial) },
            { k: 'Operaciones', v: d.operaciones, s: `${d.ganadas} ganadas · ${d.perdidas} perdidas` },
            { k: 'Ganadoras', v: d.tasa_acierto != null ? pct(d.tasa_acierto, 0) : '—' },
            { k: 'Hoy', v: usdtSigno(d.hoy.pnl), cls: tono(d.hoy.pnl), s: `${d.hoy.operaciones} operaciones` },
          ]} />
        </section>
      )}
      <div className="grid g-main">
        <div className="stack">
          <Panel titulo="Curva de capital" aside={puntos.length ? `${puntos.length} operaciones` : undefined}>
            {r.cargando ? <div className="sk" style={{ height: 220 }} /> : puntos.length ? <CurvaCapital puntos={puntos} inicial={d?.capital_inicial ?? 0} /> : <Vacio icono={<BookOpen size={26} aria-hidden />} titulo="Sin operaciones todavía">Registra tu primera operación cerrada y aquí verás cómo crece el capital.</Vacio>}
          </Panel>
          <Panel titulo="Operaciones" flush>
            {r.error ? <div className="panel-b"><ErrorEstado mensaje={r.error} reintentar={r.run} /></div> : r.cargando ? <div className="panel-b"><Esqueleto filas={4} /></div> : ops.length ? (
              <div className="table-wrap"><table className="t">
                <thead><tr><th scope="col">Fecha</th><th scope="col">Moneda</th><th scope="col" className="hide-sm">Lado</th><th scope="col" className="r">Resultado</th><th scope="col" className="hide-sm">Nota</th><th scope="col"><span className="sr-only">Acciones</span></th></tr></thead>
                <tbody>{ops.map((o) => (
                  <tr key={o.id}>
                    <td className="num muted">{fechaHora(o.fecha)}</td><td className="strong">{o.simbolo}</td><td className="hide-sm">{o.lado ? <LadoTag lado={o.lado} size={12} /> : '—'}</td>
                    <td className={`r num strong ${o.pnl >= 0 ? 'gain' : 'loss'}`}>{usdtSigno(o.pnl)}</td>
                    <td className="muted hide-sm" style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis' }} title={o.nota ?? undefined}>{o.nota ?? ''}</td>
                    <td className="r"><button className="btn btn-ghost btn-sm icon-btn" onClick={() => { if (confirm(`¿Borrar la operación de ${o.simbolo} (${usdtSigno(o.pnl)})?`)) borrar(o.id); }} aria-label={`Borrar operación de ${o.simbolo}`}><Trash2 size={14} /></button></td>
                  </tr>
                ))}</tbody></table></div>
            ) : <div className="panel-b muted">Todavía no hay operaciones.</div>}
          </Panel>
        </div>
        <div className="stack">
          <Registrar onHecho={async () => { await Promise.all([r.run(), refrescar()]); }} />
          {dias.length > 0 && (
            <Panel titulo="Por día" flush>
              <div className="table-wrap"><table className="t"><thead><tr><th scope="col">Día</th><th scope="col" className="r">Operaciones</th><th scope="col" className="r">Resultado</th></tr></thead>
                <tbody>{dias.map((x) => <tr key={x.t}><td>{fechaCorta(x.t)}</td><td className="r num">{x.g}/{x.n}</td><td className={`r num strong ${x.pnl >= 0 ? 'gain' : 'loss'}`}>{usdtSigno(x.pnl)}</td></tr>)}</tbody></table></div>
            </Panel>
          )}
        </div>
      </div>
    </Pagina>
  );
}

function Registrar({ onHecho }: { onHecho: () => Promise<void> }) {
  const { aviso } = useSesion();
  const [f, setF] = useState({ simbolo: '', lado: 'LONG' as Lado, pnl: '', nota: '' });
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const pnl = Number(f.pnl.replace(',', '.'));
    if (!/^[A-Z0-9]{1,20}$/.test(f.simbolo)) { setErr('Escribe la moneda, por ejemplo SOL.'); return; }
    if (!Number.isFinite(pnl) || f.pnl.trim() === '') { setErr('Escribe el resultado en USDT (negativo si perdiste).'); return; }
    setErr(null); setGuardando(true);
    try { await backend.registrar({ simbolo: f.simbolo, lado: f.lado, pnl, nota: f.nota || null }); setF({ ...f, pnl: '', nota: '' }); await onHecho(); aviso(`Registrado: ${usdtSigno(pnl)}`); }
    catch (x) { setErr((x as Error).message); }
    finally { setGuardando(false); }
  };
  return (
    <Panel titulo="Registrar operación">
      <form onSubmit={enviar} style={{ display: 'grid', gap: 12 }} noValidate>
        <div className="form-row">
          <Campo etiqueta="Moneda"><input className="input" value={f.simbolo} onChange={(e) => setF({ ...f, simbolo: e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '') })} placeholder="SOL" /></Campo>
          <div className="field"><span>Lado</span><div className="seg" role="group" aria-label="Lado">{(['LONG', 'SHORT'] as Lado[]).map((l) => <button type="button" key={l} aria-pressed={f.lado === l} onClick={() => setF({ ...f, lado: l })}>{l}</button>)}</div></div>
        </div>
        <Campo etiqueta="Resultado" hint="Con comisiones, el que muestra tu exchange. Negativo si perdiste.">
          <div className="input-wrap"><input className="input num" inputMode="decimal" value={f.pnl} onChange={(e) => setF({ ...f, pnl: e.target.value })} placeholder="-0.35" /><span className="suf">USDT</span></div>
        </Campo>
        <Campo etiqueta="Nota (opcional)"><input className="input" value={f.nota} maxLength={500} onChange={(e) => setF({ ...f, nota: e.target.value })} /></Campo>
        {err && <Nota tono="warn">{err}</Nota>}
        <button className="btn btn-primary" disabled={guardando}><Plus size={16} aria-hidden />{guardando ? 'Guardando…' : 'Registrar'}</button>
      </form>
    </Panel>
  );
}

// ---------------- Ajustes ----------------
const ZONAS = ['America/La_Paz', 'America/Lima', 'America/Bogota', 'America/Mexico_City', 'America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Caracas', 'Europe/Madrid', 'UTC'];
export function Ajustes() {
  const { perfil, estado, refrescar, aviso, demo, sesion } = useSesion();
  const [a, setA] = useState<TAjustes>({});
  const [capital, setCapital] = useState('');
  const [tema, setTemaS] = useState<'dark' | 'light'>(() => (document.documentElement.dataset.theme === 'light' ? 'light' : 'dark'));
  const [guardando, setGuardando] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { if (perfil) { setA(perfil.ajustes ?? {}); setCapital(perfil.capital_inicial ? String(perfil.capital_inicial) : ''); } }, [perfil]);
  if (!perfil || !estado) return <Pagina titulo="Ajustes"><Esqueleto /></Pagina>;
  const cfg = estado.cfg;
  const v = <K extends keyof TAjustes>(k: K) => (a[k] ?? cfg[k]) as NonNullable<TAjustes[K]>;
  const n = (k: keyof TAjustes) => (e: React.ChangeEvent<HTMLInputElement>) => setA({ ...a, [k]: e.target.value === '' ? undefined : Number(e.target.value) });
  const rc = v('riesgo_por_confianza');
  const setTema = (t: 'dark' | 'light') => { setTemaS(t); document.documentElement.dataset.theme = t; try { localStorage.setItem('cripto-trader-tema', t); } catch { /* nada */ } };

  const guardar = async (e: FormEvent) => {
    e.preventDefault();
    const c = Number(capital.replace(',', '.'));
    if (!(c > 0)) { setErr('El capital inicial debe ser mayor que 0.'); return; }
    setErr(null); setGuardando(true);
    try { await backend.guardarPerfil({ ajustes: a, capital_inicial: c }); await refrescar(); aviso('Ajustes guardados'); }
    catch (x) { setErr((x as Error).message); }
    finally { setGuardando(false); }
  };
  const num = (k: keyof TAjustes, et: string, suf: string, hint: string, max: number) => (
    <Campo etiqueta={et} hint={hint}><div className="input-wrap"><input className="input num" type="number" min={0} max={max} step="any" value={String(v(k) ?? '')} onChange={n(k)} /><span className="suf">{suf}</span></div></Campo>
  );

  return (
    <Pagina titulo="Ajustes">
      <form onSubmit={guardar} className="grid g-main" noValidate>
        <div className="stack">
          <Panel titulo="Operativa">
            <div style={{ display: 'grid', gap: 16 }}>
              <div className="form-row">
                <div className="field"><span>Exchange de los datos</span><div className="seg" role="group" aria-label="Exchange">{(['BINANCE', 'BYBIT', 'MEXC'] as const).map((x) => <button type="button" key={x} aria-pressed={v('exchange') === x} onClick={() => setA({ ...a, exchange: x })}>{nombreExchange(x)}</button>)}</div></div>
                <Campo etiqueta="Zona horaria" hint={`La de este navegador: ${zonaNavegador()}`}>
                  <select className="select" value={(a.zona_horaria ?? '') as string} onChange={(e) => setA({ ...a, zona_horaria: e.target.value || null })}>
                    <option value="">La del navegador</option>{ZONAS.map((z) => <option key={z} value={z}>{z}</option>)}
                  </select>
                </Campo>
              </div>
              <div className="form-row">
                <Campo etiqueta="Capital inicial del diario"><div className="input-wrap"><input className="input num" inputMode="decimal" value={capital} onChange={(e) => setCapital(e.target.value)} /><span className="suf">USDT</span></div></Campo>
                {num('objetivo_usdt', 'Objetivo por operación', 'USDT', 'Si llegan los 3 TP. 0 = solo riesgo.', 1000)}
              </div>
              <div className="form-row">
                {num('margen_base', 'Margen base', 'USDT', 'Lo que pones por operación.', 100000)}
                {num('reinversion_pct', 'Reinversión de ganancias', '%', 'Se suma al margen sugerido.', 100)}
              </div>
            </div>
          </Panel>
          <Panel titulo="Riesgo">
            <div style={{ display: 'grid', gap: 16 }}>
              <Nota>Estos frenos solo pueden ser <strong>más estrictos</strong> que los del motor: 30x de apalancamiento, 10 % de pérdida por operación y 20 % por día como máximo. Un valor mayor se recorta.</Nota>
              <div className="form-row">
                {num('apalancamiento_max', 'Apalancamiento máximo', 'x', 'Tope del motor: 30x.', 30)}
                {num('max_perdida_dia_pct', 'Pérdida máxima del día', '%', 'Al llegar, se para hasta mañana.', 20)}
              </div>
              <div className="form-row">
                {(['ALTA', 'MEDIA', 'BAJA'] as const).map((k) => (
                  <Campo key={k} etiqueta={`Pérdida en el SL, confianza ${k.toLowerCase()}`}>
                    <div className="input-wrap"><input className="input num" type="number" min={0.5} max={10} step="0.5" value={rc[k]} onChange={(e) => setA({ ...a, riesgo_por_confianza: { ...rc, [k]: Number(e.target.value) } })} /><span className="suf">%</span></div>
                  </Campo>
                ))}
              </div>
              <div className="form-row">
                {num('max_operaciones_dia', 'Operaciones por día', 'máx.', '', 100)}
                {num('max_operaciones_hora', 'Operaciones por hora', 'máx.', 'El sobre-trading es la forma más rápida de perder.', 20)}
                {num('pausa_min', 'Pausa tras 2 pérdidas', 'min', '', 240)}
              </div>
            </div>
          </Panel>
          {err && <Nota tono="warn">{err}</Nota>}
          <div><button className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar ajustes'}</button></div>
        </div>
        <div className="stack">
          <Panel titulo="Apariencia">
            <div className="seg" role="group" aria-label="Tema">{([['dark', 'Oscuro'], ['light', 'Claro']] as const).map(([k, t]) => <button type="button" key={k} aria-pressed={tema === k} onClick={() => setTema(k)}>{t}</button>)}</div>
          </Panel>
          <Panel titulo="Cuenta">
            <Filas items={[
              { k: 'Usuario', v: demo ? 'Modo demo' : sesion?.user.email ?? '—' },
              { k: 'Aviso de riesgos aceptado', v: perfil.acepto_aviso_en ? fechaHora(perfil.acepto_aviso_en) : 'no' },
            ]} />
            {demo && <button type="button" className="btn btn-sm" style={{ marginTop: 12 }} onClick={() => { reiniciarDemo(); location.reload(); }}>Reiniciar la demo</button>}
          </Panel>
          <Panel titulo="Reglas fijas del plan">
            <Filas items={[
              { k: 'SL', v: '0.3 % a 0.8 %, calibrado por tiempo' },
              { k: 'TPs', v: '1R · 1.8R · 2.6R' },
              { k: 'Reparto', v: '50 % · 25 % · 25 %' },
              { k: 'Entrada caduca', v: `${cfg.validez_entrada_min as number} min` },
              { k: 'Sin TP1, cierra', v: `10 a ${cfg.espera_max_min as number} min` },
              { k: 'Cierre total', v: `${cfg.duracion_max_min as number} min` },
              { k: 'Liquidación', v: 'al menos 2x más lejos que el SL' },
            ]} />
          </Panel>
        </div>
      </form>
    </Pagina>
  );
}

// ---------------- Letra pequeña ----------------
export function Legal() {
  return (
    <Pagina titulo="Letra pequeña">
      <article className="prose">
        <p><strong>No es asesoría financiera.</strong> Cripto60 es software que lee datos públicos y hace cálculos. Los futuros apalancados pueden liquidarte, y la mayoría de quienes hacen trading pierden dinero. Opera solo lo que puedas perder.</p>
        <h2>La confianza no es una probabilidad</h2>
        <p>La confianza mide cuánto coinciden los indicadores. La simulación (velas reales de 1 minuto sorteadas) mide tiempos y distancias, no la ventaja. La ventaja la mide el historial real de las últimas 28 horas, aproximadamente, y eso es poco tiempo: el mercado cambia y lo que funcionó ayer puede no funcionar hoy.</p>
        <h2>El trading de corto plazo es difícil</h2>
        <p>Las comisiones y el exceso de operaciones hacen que la mayoría pierda. Si el historial real sale negativo, <strong>cree en el historial</strong>: por eso la app dice NO OPERAR.</p>
        <h2>Un stop es un plan, no una garantía</h2>
        <p>En un movimiento brusco el stop puede ejecutarse peor que el precio indicado.</p>
        <h2>Datos gratuitos</h2>
        <p>Las APIs públicas de Binance, Bybit, MEXC e Hyperliquid, y los RSS de noticias, pueden fallar o retrasarse. Comprueba el precio en tu exchange antes de entrar.</p>
        <h2>Tu cuenta</h2>
        <p>La app nunca pide API keys ni toca tu exchange. Las órdenes las pones tú. Tus operaciones y ajustes se guardan en tu cuenta y solo tú puedes verlos.</p>
        <p className="faint" style={{ fontSize: 14 }}>Basado en day-trader-skill (MIT), reescrito para futuros cripto. Licencia MIT.</p>
      </article>
    </Pagina>
  );
}
