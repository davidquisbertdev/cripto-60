import type { ReactNode } from 'react';
import { AlertTriangle, ArrowDownRight, ArrowUpRight, CircleSlash, Info, RotateCw, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { Lado, Nivel } from '../lib/tipos';

export function Panel({ titulo, aside, children, flush, className = '', id }: { titulo?: ReactNode; aside?: ReactNode; children: ReactNode; flush?: boolean; className?: string; id?: string }) {
  return (
    <section className={`panel ${className}`} aria-labelledby={id}>
      {titulo != null && (
        <header className="panel-h">
          <h2 id={id}>{titulo}</h2>
          {aside && <div className="aside">{aside}</div>}
        </header>
      )}
      <div className={`panel-b${flush ? ' flush' : ''}`}>{children}</div>
    </section>
  );
}

export function LadoTag({ lado, size = 14 }: { lado: Lado | 'NO OPERAR'; size?: number }) {
  if (lado === 'NO OPERAR') return <span className="tag"><CircleSlash size={size - 2} aria-hidden />NO OPERAR</span>;
  return lado === 'LONG'
    ? <span className="tag tag-gain"><ArrowUpRight size={size} aria-hidden />LONG</span>
    : <span className="tag tag-loss"><ArrowDownRight size={size} aria-hidden />SHORT</span>;
}

export function NivelTag({ nivel }: { nivel: Nivel }) {
  const cls = nivel === 'BAJA' ? 'tag-warn' : ''; // verde y azul quedan para resultado y acción
  return <span className={`tag ${cls}`}>{nivel === 'NO OPERAR' ? 'Sin confianza' : `Confianza ${nivel.toLowerCase()}`}</span>;
}

type Tono = 'info' | 'warn' | 'loss' | 'gain';
const ICONO: Record<Tono, typeof Info> = { info: Info, warn: AlertTriangle, loss: ShieldAlert, gain: CheckCircle2 };
export function Nota({ tono = 'info', children, titulo }: { tono?: Tono; children: ReactNode; titulo?: ReactNode }) {
  const I = ICONO[tono];
  return (
    <div className={`note${tono === 'info' ? '' : ` note-${tono}`}`} role={tono === 'loss' || tono === 'warn' ? 'alert' : undefined}>
      <I size={16} aria-hidden />
      <div>{titulo && <strong>{titulo} </strong>}{children}</div>
    </div>
  );
}

export function Vacio({ icono, titulo, children, accion }: { icono: ReactNode; titulo: string; children?: ReactNode; accion?: ReactNode }) {
  return (
    <div className="empty">
      {icono}
      <h3>{titulo}</h3>
      {children && <p>{children}</p>}
      {accion}
    </div>
  );
}

export function ErrorEstado({ mensaje, reintentar }: { mensaje: string; reintentar?: () => void }) {
  return (
    <div className="panel">
      <Vacio icono={<AlertTriangle size={28} aria-hidden />} titulo="No se pudieron leer los datos" accion={reintentar && <button className="btn" onClick={reintentar}><RotateCw size={15} aria-hidden />Reintentar</button>}>
        {mensaje}
      </Vacio>
    </div>
  );
}

export function Esqueleto({ filas = 4, alto = 18 }: { filas?: number; alto?: number }) {
  return (
    <div className="panel" aria-busy="true" aria-label="Cargando">
      <div className="panel-b" style={{ display: 'grid', gap: 14 }}>
        <div className="sk" style={{ height: 34, width: '40%' }} />
        {Array.from({ length: filas }).map((_, i) => <div key={i} className="sk" style={{ height: alto, width: `${92 - i * 9}%` }} />)}
      </div>
    </div>
  );
}

export function Campo({ etiqueta, hint, error, id, children }: { etiqueta: string; hint?: ReactNode; error?: string | null; id?: string; children: ReactNode }) {
  return (
    <label className="field" htmlFor={id}>
      <span>{etiqueta}</span>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </label>
  );
}

export function KV({ items }: { items: { k: string; v: ReactNode; s?: ReactNode; cls?: string }[] }) {
  return (
    <div className="kv">
      {items.map((x) => (
        <div key={x.k}><div className="k">{x.k}</div><div className={`v num ${x.cls ?? ''}`}>{x.v}</div>{x.s && <div className="s">{x.s}</div>}</div>
      ))}
    </div>
  );
}

export function Filas({ items }: { items: { k: ReactNode; v: ReactNode; cls?: string }[] }) {
  return <div className="rows">{items.map((x, i) => <div className="row" key={i}><span className="k">{x.k}</span><span className={`v num ${x.cls ?? ''}`}>{x.v}</span></div>)}</div>;
}
