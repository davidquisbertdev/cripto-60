// «Cómo está el día»: sentimiento (Fear & Greed hoy y 30 días), BTC en 24 h, cuántas monedas suben o
// bajan, la distribución de los cambios, las que más se mueven y el funding medio.
import { Link } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import { ErrorEstado, Esqueleto, Filas, Panel } from './ui';
import { Histograma, LineaSerie, MedidorFNG } from './graficos';
import { backend } from '../lib/api';
import { usePeticion } from '../lib/usar';
import { hace, hora, numero, pct, pctSigno } from '../lib/formato';
import type { FNG, InformeMercado } from '../lib/tipos';

const dia = (t: number) => new Date(t).toLocaleDateString('es', { day: 'numeric', month: 'short' });

// Lectura en una frase del sentimiento y la amplitud, para decidir con qué ánimo operar hoy.
function lectura(m: InformeMercado) {
  const out: string[] = [];
  const a = m.amplitud;
  if (a.pct_suben != null) out.push(a.pct_suben >= 65 ? `Día alcista: el ${pct(a.pct_suben, 0)} de las monedas suben.` : a.pct_suben <= 35 ? `Día bajista: el ${pct(100 - a.pct_suben, 0)} de las monedas bajan.` : `Día mixto: ${a.suben} suben y ${a.bajan} bajan.`);
  if (m.fng) out.push(m.fng.valor <= 25 ? 'Miedo extremo: los SHORT van con la masa y hay riesgo de rebotes bruscos.' : m.fng.valor >= 75 ? 'Codicia extrema: los LONG van con la masa y hay riesgo de barridas hacia abajo.' : 'Sentimiento sin extremos: manda el análisis técnico.');
  if (m.funding_medio_pct != null && Math.abs(m.funding_medio_pct) >= 0.03) out.push(m.funding_medio_pct > 0 ? 'Funding medio alto: muchos longs apalancados.' : 'Funding medio negativo: muchos shorts apalancados.');
  return out;
}

export function Sentimiento30({ fng }: { fng: FNG }) {
  const h = fng.historial ?? [];
  return h.length > 2
    ? <LineaSerie puntos={h.map((x) => ({ t: x.t, v: x.valor }))} fmtV={(v) => numero(v, 0)} fmtT={dia} etiqueta="Fear & Greed de los últimos 30 días" dominio={[0, 100]} refs={[{ v: 25, que: 'miedo extremo' }, { v: 75, que: 'codicia extrema' }]} alto={160} />
    : <p className="muted" style={{ fontSize: 13 }}>Sin historial de días anteriores.</p>;
}

export function MercadoHoy() {
  const r = usePeticion(() => backend.motor<InformeMercado>('mercado'), []);
  const m = r.datos;
  const act = <button className="btn btn-sm icon-btn" onClick={r.run} disabled={r.cargando} aria-busy={r.cargando} aria-label={r.cargando ? 'Actualizando el mercado' : 'Actualizar el mercado'}><RefreshCw size={14} className={r.cargando ? 'girando' : undefined} aria-hidden /></button>;
  if (r.cargando && !m) return <Panel titulo="Cómo está el mercado hoy"><Esqueleto filas={4} /></Panel>;
  if (r.error) return <Panel titulo="Cómo está el mercado hoy"><ErrorEstado mensaje={r.error} reintentar={r.run} /></Panel>;
  if (!m) return null;
  const a = m.amplitud, b = m.btc;
  const tonoBtc = b?.cambio_24h_pct == null ? 'var(--accent)' : b.cambio_24h_pct >= 0 ? 'var(--gain)' : 'var(--loss)';
  return (
    <section className="stack" aria-label="Cómo está el mercado hoy">
      <div className="grid g-2">
        <Panel titulo="Sentimiento (Fear & Greed)" aside={<span className="faint" style={{ fontSize: 12 }}>diario · alternative.me</span>}>
          {m.fng ? (
            <div style={{ display: 'grid', gap: 16 }}>
              <MedidorFNG valor={m.fng.valor} clase={m.fng.clase} ayer={m.fng.ayer} semana={m.fng.semana} />
              <Sentimiento30 fng={m.fng} />
            </div>
          ) : <p className="muted">No se pudo leer el índice ahora.</p>}
        </Panel>
        <Panel titulo="BTC en 24 h" aside={act}>
          {b ? (
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="num" style={{ fontSize: 28, fontWeight: 700 }}>{numero(b.precio, 1)}</span>
                <span className={`num strong ${(b.cambio_24h_pct ?? 0) >= 0 ? 'gain' : 'loss'}`}>{pctSigno(b.cambio_24h_pct)}</span>
                <span className="faint num" style={{ fontSize: 13 }}>mín. {numero(b.min, 1)} · máx. {numero(b.max, 1)}</span>
              </div>
              <LineaSerie puntos={b.serie.map((x) => ({ t: x.t, v: x.c }))} fmtV={(v) => numero(v, 0)} fmtT={(t) => hora(t)} etiqueta="BTC en las últimas 24 h (velas de 15 min)" tono={tonoBtc} alto={170} />
              <Link to="/btc" style={{ fontSize: 13 }}>Ver la lectura de BTC</Link>
            </div>
          ) : <p className="muted">Sin datos de BTC.</p>}
        </Panel>
      </div>
      <div className="grid g-2">
        <Panel titulo="Amplitud: cuántas suben y cuántas bajan" aside={<span className="faint" style={{ fontSize: 12 }}>{a.total} monedas líquidas · {hace(m.ahora)}</span>}>
          <div style={{ display: 'grid', gap: 14 }}>
            <div>
              <div className="split-bar" role="img" aria-label={`${a.suben} suben y ${a.bajan} bajan en 24 h`}>
                <i style={{ width: `${(100 * a.suben) / (a.total || 1)}%`, background: 'var(--gain)' }} />
                <i style={{ width: `${(100 * (a.total - a.suben - a.bajan)) / (a.total || 1)}%`, background: 'var(--neutral-mark)' }} />
                <i style={{ width: `${(100 * a.bajan) / (a.total || 1)}%`, background: 'var(--loss)' }} />
              </div>
              <div className="prob-legend" style={{ marginTop: 8 }}>
                <span><i className="sw" style={{ background: 'var(--gain)' }} aria-hidden />Suben <b className="num">{a.suben}</b></span>
                <span><i className="sw" style={{ background: 'var(--loss)' }} aria-hidden />Bajan <b className="num">{a.bajan}</b></span>
              </div>
            </div>
            <Histograma barras={m.distribucion} etiqueta="Cambio en 24 h por tramos" />
            <Filas items={[
              { k: 'Cambio medio en 24 h', v: pctSigno(a.cambio_medio), cls: (a.cambio_medio ?? 0) >= 0 ? 'gain' : 'loss' },
              { k: 'Funding medio (30 con más volumen)', v: m.funding_medio_pct != null ? pctSigno(m.funding_medio_pct, 4) : '—' },
            ]} />
          </div>
        </Panel>
        <Panel titulo="Las que más se mueven (24 h)">
          <div style={{ display: 'grid', gap: 14 }}>
            <div className="movers">
              {([['Suben', m.subidas], ['Bajan', m.bajadas]] as const).map(([t, l]) => (
                <div key={t}>
                  <h3 style={{ fontSize: 13, marginBottom: 8 }} className="muted">{t}</h3>
                  <ol>{l.map((x) => (
                    <li key={x.moneda}><Link to={`/senal?moneda=${x.moneda}`} className="strong">{x.moneda}</Link><span className={`num ${x.cambio >= 0 ? 'gain' : 'loss'}`}>{pctSigno(x.cambio)}</span></li>
                  ))}</ol>
                </div>
              ))}
            </div>
            <ul className="list">{lectura(m).map((t) => <li key={t}>{t}</li>)}</ul>
            <p className="faint" style={{ fontSize: 12 }}>El Fear & Greed ya entra en la señal: en los extremos avisa y ajusta la confianza. Una moneda que se movió mucho hoy no es una entrada: pide su señal.</p>
          </div>
        </Panel>
      </div>
    </section>
  );
}
