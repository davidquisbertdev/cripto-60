// Cuántos TP (1, 2 o 3) y qué % de la posición cierra cada uno. Los TP van a 1R, 1.8R y 2.6R.
export const REPARTO_DEFECTO: Record<number, number[]> = { 1: [100], 2: [50, 50], 3: [50, 25, 25] };
const R_TPS = [1, 1.8, 2.6];

/** null si el reparto vale (1 a 3 valores > 0 que suman 100); si no, el mensaje de error. */
export function errorReparto(r: number[]): string | null {
  if (r.length < 1 || r.length > 3) return 'Elige de 1 a 3 TP.';
  if (r.some((x) => !(x > 0))) return 'Cada TP tiene que cerrar más de 0 %.';
  const s = r.reduce((a, b) => a + b, 0);
  if (Math.abs(s - 100) > 0.01) return `Los % suman ${+s.toFixed(2)}: tienen que sumar 100.`;
  return null;
}

export function EditorTPs({ valor, onCambio, id = 'tps' }: { valor: number[]; onCambio: (r: number[]) => void; id?: string }) {
  const n = valor.length;
  const err = errorReparto(valor);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="seg" role="group" aria-label="Número de TP">
        {[1, 2, 3].map((k) => <button type="button" key={k} aria-pressed={n === k} onClick={() => onCambio(REPARTO_DEFECTO[k])}>{k} TP</button>)}
      </div>
      <div className="form-row">
        {valor.map((x, i) => (
          <label className="field" key={i} htmlFor={`${id}-${i}`}>
            <span>TP{i + 1} <span className="faint">a {R_TPS[i]}R</span></span>
            <div className="input-wrap">
              <input id={`${id}-${i}`} className="input num" type="number" min={1} max={100} step={1} value={Number.isFinite(x) ? x : ''} aria-invalid={!!err}
                onChange={(e) => onCambio(valor.map((y, j) => (j === i ? (e.target.value === '' ? NaN : Number(e.target.value)) : y)))} />
              <span className="suf">%</span>
            </div>
          </label>
        ))}
      </div>
      <span className={err ? 'warn' : 'faint'} style={{ fontSize: 12 }} role={err ? 'alert' : undefined}>
        {err ?? (n === 1 ? 'Un solo TP: cierra todo a 1R.' : `Cierra ${valor.map((x) => `${x} %`).join(' · ')}. Al tocar el TP1 el SL pasa a la entrada.`)}
      </span>
    </div>
  );
}
