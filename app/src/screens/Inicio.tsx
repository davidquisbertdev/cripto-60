import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Activity, ArrowRight, BookOpen, ShieldCheck, Zap } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { Campo, Esqueleto, Filas, KV, LadoTag, Nota, Panel, Vacio } from '../components/ui';
import { backend } from '../lib/api';
import { useSesion } from '../lib/sesion';
import { fechaHora, hace, hora, pct, tono, usdt, usdtSigno } from '../lib/formato';
import { usePeticion } from '../lib/usar';
import { MercadoHoy } from '../components/MercadoHoy';

export function Inicio() {
  const { estado, perfil } = useSesion();
  if (!estado || !perfil) return <Pagina titulo="Inicio"><Esqueleto filas={5} /></Pagina>;
  if (!perfil.capital_inicial || !perfil.acepto_aviso_en) return <Pagina titulo="Bienvenido"><Alta /></Pagina>;
  const d = estado.diario!, cfg = estado.cfg, pos = estado.posicion_abierta;
  const perdidaDia = (d.capital - d.hoy.pnl) * (cfg.max_perdida_dia_pct / 100);

  return (
    <Pagina titulo="Inicio" acciones={<Link className="btn btn-primary" to="/senal"><Zap size={16} aria-hidden />Pedir señal</Link>}>
      {d.bloqueo ? <Nota tono="loss" titulo="Freno activo.">{d.bloqueo}</Nota>
        : d.avisos.map((a) => <Nota key={a} tono="warn">{a}</Nota>)}

      <section className="panel" aria-label="Capital">
        <KV items={[
          { k: 'Capital', v: usdt(d.capital, 2), s: `desde ${usdt(d.capital_inicial, 2)}` },
          { k: 'Resultado total', v: usdtSigno(d.capital - d.capital_inicial), s: `${pct((100 * (d.capital - d.capital_inicial)) / d.capital_inicial)} sobre el inicial`, cls: d.capital >= d.capital_inicial ? 'gain' : 'loss' },
          { k: 'Hoy', v: usdtSigno(d.hoy.pnl), s: `${d.hoy.operaciones} de ${cfg.max_operaciones_dia} operaciones`, cls: tono(d.hoy.pnl) },
          { k: 'Margen sugerido', v: usdt(d.margen_sugerido, 2), s: `base ${usdt(cfg.margen_base, 0)} + ${cfg.reinversion_pct} % de lo ganado` },
          { k: 'Ganadoras', v: d.tasa_acierto != null ? pct(d.tasa_acierto, 0) : '—', s: `${d.ganadas} de ${d.operaciones}` },
        ]} />
      </section>

      <div className="grid g-main">
        <div className="stack">
          <Panel titulo="Posición abierta" aside={pos && <Link to="/posicion">Revisar <ArrowRight size={13} aria-hidden style={{ verticalAlign: -2 }} /></Link>}>
            {pos ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                <LadoTag lado={pos.lado} /><strong style={{ fontSize: 18 }}>{pos.base}</strong>
                <span className="muted num">entrada {pos.entrada} · SL {pos.sl} · abierta {hace(Date.parse(pos.abierta))}</span>
                <Link className="btn btn-sm" style={{ marginLeft: 'auto' }} to="/posicion"><Activity size={14} aria-hidden />Ver qué hacer</Link>
              </div>
            ) : <p className="muted">No sigues ninguna. Cuando entres desde una señal, aparecerá aquí con su reloj.</p>}
          </Panel>
          <Panel titulo="Últimas operaciones" aside={<Link to="/diario">Diario <ArrowRight size={13} aria-hidden style={{ verticalAlign: -2 }} /></Link>} flush>
            <Ultimas />
          </Panel>
        </div>
        <Panel titulo="Frenos del día" aside={<ShieldCheck size={15} aria-hidden />}>
          <Filas items={[
            { k: `Pérdidas seguidas (pausa con ${cfg.perdidas_seguidas_pausa})`, v: `${d.perdidas_seguidas} de ${cfg.perdidas_seguidas_parar}`, cls: d.perdidas_seguidas ? 'warn' : '' },
            { k: `Pérdida máxima del día (${cfg.max_perdida_dia_pct} %)`, v: usdt(perdidaDia, 2) },
            { k: 'Operaciones última hora', v: `${d.hoy.ultima_hora} de ${cfg.max_operaciones_hora}` },
            { k: 'Riesgo por operación', v: d.factor_riesgo < 1 ? 'a la mitad' : 'normal', cls: d.factor_riesgo < 1 ? 'warn' : '' },
            ...(d.pausa_hasta ? [{ k: 'Pausa hasta', v: hora(d.pausa_hasta), cls: 'warn' }] : []),
          ]} />
        </Panel>
      </div>

      <MercadoHoy />
    </Pagina>
  );
}

function Alta() {
  const { refrescar, perfil } = useSesion();
  const [capital, setCapital] = useState(perfil?.capital_inicial ? String(perfil.capital_inicial) : '');
  const [acepto, setAcepto] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    const n = Number(capital.replace(',', '.'));
    if (!(n > 0)) { setErr('Escribe tu capital en USDT, por ejemplo 20.'); return; }
    if (!acepto) { setErr('Para seguir, confirma que entiendes los riesgos.'); return; }
    setGuardando(true);
    try { await backend.guardarPerfil({ capital_inicial: n, acepto_aviso_en: new Date().toISOString() }); await refrescar(); }
    catch (x) { setErr((x as Error).message); setGuardando(false); }
  };
  return (
    <div style={{ maxWidth: 560, display: 'grid', gap: 20 }}>
      <div style={{ display: 'grid', gap: 8 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700 }}>Empieza tu diario</h2>
        <p className="muted" style={{ fontSize: 15 }}>El capital con el que empiezas sirve para calcular cuánto arriesgar, el margen sugerido y los frenos del día. Puedes cambiarlo después en Ajustes.</p>
      </div>
      <form className="panel" onSubmit={enviar} noValidate>
        <div className="panel-b" style={{ display: 'grid', gap: 16 }}>
          <Campo etiqueta="Capital inicial" error={err}>
            <div className="input-wrap"><input className="input num" inputMode="decimal" autoFocus value={capital} onChange={(e) => setCapital(e.target.value)} placeholder="20" /><span className="suf">USDT</span></div>
          </Campo>
          <div className="note">
            <ShieldCheck size={16} aria-hidden />
            <div style={{ display: 'grid', gap: 6 }}>
              <span><strong>No es asesoría financiera.</strong> Los futuros apalancados pueden liquidarte y la mayoría de quienes hacen trading pierden dinero. Opera solo lo que puedas perder. Las órdenes las pones tú en tu exchange: esta app nunca toca tu cuenta.</span>
              <Link to="/terminos">Leer los términos y condiciones</Link>
            </div>
          </div>
          <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            <input type="checkbox" checked={acepto} onChange={(e) => setAcepto(e.target.checked)} style={{ marginTop: 3 }} />
            <span>Entiendo los riesgos y que la confianza de una señal no es una probabilidad de ganar.</span>
          </label>
          <button className="btn btn-primary" type="submit" disabled={guardando}>{guardando ? 'Guardando…' : 'Empezar'}</button>
        </div>
      </form>
    </div>
  );
}

function Ultimas() {
  const r = usePeticion(() => backend.operaciones(), []);
  if (r.cargando) return <div className="panel-b"><div className="sk" style={{ height: 120 }} /></div>;
  if (r.error) return <div className="panel-b"><Nota tono="warn">{r.error}</Nota></div>;
  const ops = (r.datos ?? []).slice(0, 5);
  if (!ops.length) return <Vacio icono={<BookOpen size={24} aria-hidden />} titulo="Aún no registraste operaciones">Cuando cierres una, regístrala para llevar el capital y los frenos del día.</Vacio>;
  return (
    <div className="table-wrap"><table className="t">
      <thead><tr><th scope="col">Fecha</th><th scope="col">Moneda</th><th scope="col" className="hide-sm">Lado</th><th scope="col" className="r">Resultado</th></tr></thead>
      <tbody>{ops.map((o) => (
        <tr key={o.id}><td className="num muted">{fechaHora(o.fecha)}</td><td className="strong">{o.simbolo}</td><td className="hide-sm">{o.lado ? <LadoTag lado={o.lado} size={12} /> : '—'}</td><td className={`r num strong ${o.pnl >= 0 ? 'gain' : 'loss'}`}>{usdtSigno(o.pnl)}</td></tr>
      ))}</tbody>
    </table></div>
  );
}
