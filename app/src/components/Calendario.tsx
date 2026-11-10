// Calendario económico: los datos macro (IPC, empleo, Fed...) que mueven a todas las cripto a la vez,
// con su importancia, la previsión y, si ya salieron, cuánto se movió BTC después.
import { CalendarClock } from 'lucide-react';
import { Panel } from './ui';
import { fechaHora, hora, pctSigno } from '../lib/formato';
import type { Calendario, EventoMacro } from '../lib/tipos';

const TONO: Record<string, string> = { 'CRÍTICA': 'tag-loss', ALTA: 'tag-warn', MEDIA: '' };
const hoy = (t: number, ahora: number) => new Date(t).toDateString() === new Date(ahora).toDateString();

function Fila({ e, ahora, enVentana }: { e: EventoMacro; ahora: number; enVentana: boolean }) {
  const r = e.reaccion_btc;
  const falta = Math.round((e.fecha - ahora) / 60e3);
  return (
    <li style={{ display: 'grid', gap: 4, padding: '10px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`tag ${TONO[e.importancia]}`}>{e.importancia}</span>
        <span className="num" style={{ fontWeight: 600 }}>{hoy(e.fecha, ahora) ? hora(e.fecha) : fechaHora(e.fecha)}</span>
        <span>{e.que_es}</span>
        <span className="faint" style={{ fontSize: 12 }}>{e.pais}</span>
        {enVentana && <span className="tag tag-warn">dentro de tu operación</span>}
        {!e.publicado && falta <= 180 && <span className="faint num" style={{ fontSize: 12 }}>en {falta < 60 ? `${falta} min` : `${(falta / 60).toFixed(1)} h`}</span>}
      </div>
      <div className="muted num" style={{ fontSize: 13 }}>
        {e.prevision ? `Previsión ${e.prevision}` : 'Sin previsión'}{e.anterior ? ` · anterior ${e.anterior}` : ''}
        {e.publicado && (r ? <> · <span className={(r.cambio_60m_pct ?? r.cambio_15m_pct ?? 0) < 0 ? 'loss' : 'gain'}>BTC {pctSigno(r.cambio_15m_pct)} en 15 min, {pctSigno(r.cambio_60m_pct)} en 1 h</span> (rango {pctSigno(r.min_pct)} / {pctSigno(r.max_pct)})</> : ' · ya salió')}
      </div>
      {!e.publicado && e.importancia !== 'MEDIA' && <div className="faint" style={{ fontSize: 12 }}>{e.efecto}</div>}
    </li>
  );
}

export function PanelCalendario({ c, className = '', max = 8 }: { c: Calendario; className?: string; max?: number }) {
  const enVentana = new Set(c.en_ventana ?? []);
  // primero lo que afecta a la operación, luego lo importante; lo de importancia MEDIA solo si es hoy
  const ev = c.eventos.filter((e) => e.importancia !== 'MEDIA' || enVentana.has(e.titulo) || hoy(e.fecha, c.ahora)).slice(0, max);
  const p = c.proximo_importante;
  return (
    <Panel titulo="Calendario económico" aside={<span className="faint" style={{ fontSize: 12 }}>{c.fuente}</span>} className={className}>
      <div style={{ display: 'grid', gap: 8 }}>
        {p && (
          <p style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <CalendarClock size={16} aria-hidden className={p.importancia === 'CRÍTICA' ? 'loss' : 'warn'} />
            <span>Próximo dato fuerte: <b>{p.que_es}</b> {hoy(p.fecha, c.ahora) ? `hoy a las ${hora(p.fecha)}` : fechaHora(p.fecha)}.</span>
          </p>
        )}
        {ev.length ? <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>{ev.map((e) => <Fila key={e.titulo + e.fecha} e={e} ahora={c.ahora} enVentana={enVentana.has(e.titulo)} />)}</ul>
          : <p className="muted">Sin datos macro importantes en las últimas 24 h ni en los próximos días.</p>}
        <p className="faint" style={{ fontSize: 12 }}>CRÍTICA = inflación, empleo o decisión de la Fed de EE. UU.: mueven BTC y todas las altcoins de golpe. Si cae dentro de tu operación, la señal baja un nivel. Evita entrar en los 15 min antes y la primera media hora después.</p>
      </div>
    </Panel>
  );
}
