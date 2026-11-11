// ¿Entrar ya a mercado o dejar un limit un poco mejor? Probabilidad real de que cada precio se llene en los
// próximos minutos (retrocesos de las velas de 1 min de la moneda) y la opción que recomienda el motor.
import { Timer } from 'lucide-react';
import { precio as fp } from '../lib/formato';
import type { EntradaOptima } from '../lib/tipos';

export function MejorMomento({ o, dec }: { o: EntradaOptima; dec: number }) {
  return (
    <div className="panel-b" style={{ display: 'grid', gap: 8, borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <Timer size={16} aria-hidden style={{ color: 'var(--accent)' }} />
        <b style={{ fontSize: 14 }}>Mejor momento para entrar ({o.minutos} min):</b>
        <span className={`tag ${o.recomendada === 'mercado' ? 'tag-gain' : 'tag-warn'} num`}>
          {o.recomendada === 'mercado' ? `a mercado ${fp(o.precio, dec)}` : `limit ${fp(o.precio, dec)} · se llena ${o.prob_llenado} %`}
        </span>
      </div>
      <p className="muted" style={{ fontSize: 13 }}>{o.razon}</p>
      <div className="chips" role="list" aria-label="Precios de entrada y probabilidad de llenarse">
        {o.opciones.map((x) => (
          <span key={x.precio} role="listitem" className="chip num" aria-current={x.precio === o.precio ? 'true' : undefined} title={x.que}
            style={{ display: 'inline-flex', alignItems: 'center', cursor: 'default', ...(x.precio === o.precio ? { borderColor: 'var(--accent)', color: 'var(--text)' } : {}) }}>
            {fp(x.precio, dec)} · {x.prob_llenado} %{x.mejora_r ? ` · +${x.mejora_r} R` : ''}
          </span>
        ))}
      </div>
      <p className="faint" style={{ fontSize: 12 }}>% = veces que el precio llegó ahí en {o.minutos} min en las últimas ~16 h de esta moneda. Si el limit no se llena en ese tiempo, cancélalo: la señal caduca. El SL y los TPs no cambian.</p>
    </div>
  );
}
