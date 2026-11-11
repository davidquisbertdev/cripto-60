// Gráfico de swing: velas diarias, medias de 20/50/200 días, una zona de "futuro" a la derecha con la
// proyección hacia el TP1, y las líneas de entrada, SL, TP1, trailing y niveles vigilados. Las líneas y las
// marcas se pueden pulsar: abren el registro de una entrada o salida a ese precio.
import { useMemo, useRef, useState } from 'react';
import { fechaCorta, precio as fp } from '../lib/formato';
import type { VelaD } from '../lib/tipos';

export interface NivelGrafico { clave: string; precio: number; etiqueta: string; nombre?: string; tipo: 'entrada' | 'sl' | 'tp' | 'trailing' | 'vigilar' | 'zona'; desde?: number; tocado?: number | null }
export interface MarcaGrafico { t: number; precio: number; tipo: 'entrada' | 'salida' | 'toco_tp' | 'toco_sl'; texto: string }
export interface Proyeccion { desde: number; precio: number; tp1: number; sl: number; dias_tp1: number }

const COLOR: Record<NivelGrafico['tipo'], string> = { entrada: 'var(--accent)', sl: 'var(--loss)', tp: 'var(--gain)', trailing: 'var(--warn)', vigilar: 'var(--text-2)', zona: 'var(--accent)' };
const DIA = 864e5;

export function GraficoSwing({ velas, medias, niveles, marcas = [], proyeccion = null, zona = null, dec, diasFuturo = 25, onNivel, alto = 420, ancho = 960 }: {
  velas: VelaD[]; medias?: { t: number; e20: number; e50: number; e200: number }[]; niveles: NivelGrafico[]; marcas?: MarcaGrafico[];
  proyeccion?: Proyeccion | null; zona?: { min: number; max: number } | null; dec: number; diasFuturo?: number; onNivel?: (n: NivelGrafico | MarcaGrafico) => void; alto?: number; ancho?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [hov, setHov] = useState<number | null>(null);
  const W = ancho, H = alto, L = 8, R = 128, T = 12, B = 26;
  const v = velas;
  const t0 = v[0]?.t ?? 0, tHoy = v[v.length - 1]?.t ?? 0, tFin = tHoy + diasFuturo * DIA;
  const { yMin, yMax } = useMemo(() => {
    const ps = [...v.flatMap((x) => [x.h, x.l]), ...niveles.map((n) => n.precio), ...(zona ? [zona.min, zona.max] : [])];
    const lo = Math.min(...ps), hi = Math.max(...ps), pad = (hi - lo) * 0.06 || hi * 0.01;
    return { yMin: lo - pad, yMax: hi + pad };
  }, [v, niveles, zona]);
  if (v.length < 5) return <p className="muted">Sin velas suficientes.</p>;
  const x = (t: number) => L + ((W - L - R) * (t - t0)) / (tFin - t0);
  const y = (p: number) => T + ((H - T - B) * (yMax - p)) / (yMax - yMin);
  const anchoVela = Math.max(1.5, ((W - L - R) / ((tFin - t0) / DIA)) * 0.7);
  const linea = (k: 'e20' | 'e50' | 'e200') => (medias ?? []).filter((m) => m.t >= t0).map((m, i) => `${i ? 'L' : 'M'}${x(m.t + DIA / 2).toFixed(1)},${y(m[k]).toFixed(1)}`).join('');
  const mover = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const t = t0 + ((px - L) / (W - L - R)) * (tFin - t0);
    const i = Math.round((t - t0) / DIA);
    setHov(i >= 0 && i < v.length ? i : null);
  };
  const h = hov != null ? v[hov] : null;
  const pulsable = onNivel ? { cursor: 'pointer' } : undefined;
  // fechas del eje: unas 6
  const paso = Math.ceil((tFin - t0) / DIA / 6);
  const fechas = Array.from({ length: 7 }, (_, k) => t0 + k * paso * DIA).filter((t) => t <= tFin);
  return (
    <div className="chart grafico-swing" ref={ref} onPointerMove={mover} onPointerLeave={() => setHov(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Velas diarias de ${fechaCorta(t0)} a hoy, con los niveles del plan`}>
        {/* futuro */}
        <rect x={x(tHoy + DIA)} y={T} width={x(tFin) - x(tHoy + DIA)} height={H - T - B} fill="var(--accent-soft)" opacity={0.35} />
        <text className="axis-t" x={x(tHoy + DIA) + 6} y={T + 12}>futuro</text>
        {fechas.map((t) => <text key={t} className="axis-t" x={x(t)} y={H - 8} textAnchor="middle">{fechaCorta(t)}</text>)}
        {zona && <rect x={x(tHoy)} y={y(zona.max)} width={x(tFin) - x(tHoy)} height={Math.max(2, y(zona.min) - y(zona.max))} fill="var(--accent)" opacity={0.14} onClick={() => onNivel?.({ clave: 'zona', precio: (zona.min + zona.max) / 2, etiqueta: 'Zona de entrada', tipo: 'zona' })} style={pulsable}><title>Zona de entrada</title></rect>}
        {/* medias */}
        {medias && <>
          <path d={linea('e200')} fill="none" stroke="var(--text-3)" strokeWidth={1.4} />
          <path d={linea('e50')} fill="none" stroke="var(--warn)" strokeWidth={1.2} opacity={0.8} />
          <path d={linea('e20')} fill="none" stroke="var(--accent)" strokeWidth={1.2} opacity={0.8} />
        </>}
        {/* velas */}
        {v.map((c) => {
          const sube = c.c >= c.o, col = sube ? 'var(--gain)' : 'var(--loss)', cx = x(c.t + DIA / 2);
          return (
            <g key={c.t}>
              <line x1={cx} x2={cx} y1={y(c.h)} y2={y(c.l)} stroke={col} strokeWidth={1} />
              <rect x={cx - anchoVela / 2} y={y(Math.max(c.o, c.c))} width={anchoVela} height={Math.max(1, Math.abs(y(c.o) - y(c.c)))} fill={col} />
            </g>
          );
        })}
        {/* proyección: del precio de hoy al TP1 en los días típicos (y la alternativa hacia el SL) */}
        {proyeccion && (
          <g opacity={0.9}>
            <path d={`M${x(proyeccion.desde)},${y(proyeccion.precio)} L${x(proyeccion.desde + proyeccion.dias_tp1 * DIA)},${y(proyeccion.tp1)}`} stroke="var(--gain)" strokeWidth={2} strokeDasharray="6 5" fill="none" />
            <path d={`M${x(proyeccion.desde)},${y(proyeccion.precio)} L${x(proyeccion.desde + Math.max(3, proyeccion.dias_tp1 / 2) * DIA)},${y(proyeccion.sl)}`} stroke="var(--loss)" strokeWidth={1.2} strokeDasharray="3 5" fill="none" opacity={0.6} />
            <circle cx={x(proyeccion.desde + proyeccion.dias_tp1 * DIA)} cy={y(proyeccion.tp1)} r={5} fill="var(--gain)" />
            <text className="axis-t" x={x(proyeccion.desde + proyeccion.dias_tp1 * DIA)} y={y(proyeccion.tp1) - 9} textAnchor="middle">~{proyeccion.dias_tp1} d</text>
          </g>
        )}
        {/* niveles */}
        {niveles.map((n) => {
          const desde = n.desde ? x(n.desde) : x(tHoy);
          return (
            <g key={n.clave} onClick={() => onNivel?.(n)} style={pulsable}>
              <line x1={desde} x2={x(tFin)} y1={y(n.precio)} y2={y(n.precio)} stroke="transparent" strokeWidth={14} />
              <line x1={desde} x2={x(tFin)} y1={y(n.precio)} y2={y(n.precio)} stroke={COLOR[n.tipo]} strokeWidth={n.tipo === 'vigilar' ? 1.2 : 1.8} strokeDasharray={n.tipo === 'vigilar' || n.tipo === 'trailing' ? '5 4' : undefined} />
              <rect x={W - R + 2} y={y(n.precio) - 10} width={R - 4} height={20} rx={4} fill="var(--s2)" stroke={COLOR[n.tipo]} />
              <text x={W - R + 8} y={y(n.precio) + 4} fontSize={11} fill="var(--text)" fontWeight={600} className="num">{n.etiqueta} {fp(n.precio, dec)}{n.tocado ? (n.tipo === 'sl' ? ' ✗' : ' ✓') : ''}</text>
              <title>{`${n.nombre ?? n.etiqueta}: ${fp(n.precio, dec)}${n.tocado ? ` · tocado el ${fechaCorta(n.tocado)}` : ''}${onNivel ? ' · pulsa para registrar' : ''}`}</title>
            </g>
          );
        })}
        {/* marcas: entrada, salidas y niveles tocados */}
        {marcas.map((m, k) => {
          const cx = x(m.t + DIA / 2), cy = y(m.precio);
          const col = m.tipo === 'entrada' ? 'var(--accent)' : m.tipo === 'salida' ? 'var(--warn)' : m.tipo === 'toco_tp' ? 'var(--gain)' : 'var(--loss)';
          return (
            <g key={k} onClick={() => onNivel?.(m)} style={pulsable}>
              <circle cx={cx} cy={cy} r={7} fill="var(--s1)" stroke={col} strokeWidth={2.2} />
              <text x={cx} y={cy + 3.5} fontSize={9} fontWeight={800} fill={col} textAnchor="middle">{m.tipo === 'entrada' ? 'E' : m.tipo === 'salida' ? 'S' : m.tipo === 'toco_tp' ? '✓' : '✗'}</text>
              <title>{m.texto}</title>
            </g>
          );
        })}
        {h && <line x1={x(h.t + DIA / 2)} x2={x(h.t + DIA / 2)} y1={T} y2={H - B} stroke="var(--text-3)" strokeDasharray="2 3" />}
      </svg>
      {h && (
        <div className="chart-tip num" style={{ position: 'absolute', top: 8, left: 12, fontSize: 12, background: 'var(--s2)', border: '1px solid var(--line-2)', borderRadius: 6, padding: '4px 8px', pointerEvents: 'none' }}>
          {fechaCorta(h.t)} · A {fp(h.o, dec)} · M {fp(h.h, dec)} · m {fp(h.l, dec)} · C {fp(h.c, dec)}
        </div>
      )}
    </div>
  );
}
