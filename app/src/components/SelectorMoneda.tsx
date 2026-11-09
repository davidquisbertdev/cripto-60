// Selector de moneda con buscador: lista los perpetuos USDT de Binance ordenados por volumen
// (con una lista fija de respaldo si no hay red) y acepta escribir cualquier otra.
import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Search } from 'lucide-react';

const RESPALDO = [
  'BTC', 'ETH', 'SOL', 'XRP', 'DOGE', 'BNB', 'ADA', 'SUI', 'HYPE', 'LINK', 'AVAX', 'LTC', 'TRX', 'DOT', 'NEAR', 'ENA', 'ARB', 'OP',
  'TAO', 'APT', 'WIF', '1000PEPE', '1000BONK', 'SEI', 'TIA', 'INJ', 'FET', 'RENDER', 'AAVE', 'UNI', 'ONDO', 'WLD', 'MNT', 'TON',
  'FIL', 'ATOM', 'ETC', 'BCH', 'HBAR', 'XLM', 'POL', 'JUP', 'PENGU', 'TRUMP', 'VIRTUAL', 'ONE',
];
const CLAVE = 'cripto60-monedas-v1';
const VIGENCIA = 60 * 60e3;
const EXCLUIR = /^(USDC|FDUSD|TUSD|BUSD|USDP|DAI|XAU|XAG|PAXG)/;

let cache: string[] | null = null;
let pendiente: Promise<string[]> | null = null;

async function cargar(): Promise<string[]> {
  if (cache) return cache;
  try {
    const s = sessionStorage.getItem(CLAVE);
    if (s) { const j = JSON.parse(s) as { t: number; l: string[] }; if (Date.now() - j.t < VIGENCIA && j.l.length) return (cache = j.l); }
  } catch { /* sin almacenamiento */ }
  pendiente ??= fetch('https://fapi.binance.com/fapi/v1/ticker/24hr')
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
    .then((filas: { symbol: string; quoteVolume: string }[]) => {
      const l = filas
        .filter((f) => f.symbol.endsWith('USDT') && !/_\d+$/.test(f.symbol))
        .sort((x, y) => +y.quoteVolume - +x.quoteVolume)
        .map((f) => f.symbol.slice(0, -4))
        .filter((b) => b && !EXCLUIR.test(b));
      if (!l.length) throw new Error('vacía');
      try { sessionStorage.setItem(CLAVE, JSON.stringify({ t: Date.now(), l })); } catch { /* nada */ }
      return (cache = l);
    })
    .catch(() => (cache = RESPALDO));
  return pendiente;
}

export function useMonedas() {
  const [l, setL] = useState<string[]>(cache ?? RESPALDO);
  useEffect(() => { let vivo = true; cargar().then((x) => vivo && setL(x)); return () => { vivo = false; }; }, []);
  return l;
}

const limpiar = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

export function SelectorMoneda({ valor, onCambio, placeholder = 'Busca una moneda', invalido, id, autoFocus, compacto, excluir = [] }: {
  valor: string; onCambio: (m: string) => void; placeholder?: string; invalido?: boolean; id?: string; autoFocus?: boolean; compacto?: boolean; excluir?: string[];
}) {
  const todas = useMonedas();
  const idLista = useId();
  const idInput = useId();
  const [texto, setTexto] = useState(valor);
  const [abierto, setAbierto] = useState(false);
  const [activa, setActiva] = useState(0);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLUListElement>(null);
  useEffect(() => setTexto(valor), [valor]);

  const q = limpiar(texto);
  const opciones = useMemo(() => {
    const base = todas.filter((m) => !excluir.includes(m));
    if (!q || q === valor) return base.slice(0, 60);
    const empiezan = base.filter((m) => m.startsWith(q));
    const contienen = base.filter((m) => !m.startsWith(q) && m.includes(q));
    const r = [...empiezan, ...contienen].slice(0, 60);
    return r.includes(q) ? r : [...r, q];
  }, [todas, q, valor, excluir]);

  useEffect(() => { setActiva(0); }, [q]);
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!caja.current?.contains(e.target as Node)) cerrar(); };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, texto, valor]);
  useEffect(() => { lista.current?.querySelector<HTMLElement>(`[data-i="${activa}"]`)?.scrollIntoView({ block: 'nearest' }); }, [activa]);

  const elegir = (m: string) => { setTexto(m); onCambio(m); setAbierto(false); };
  // al salir sin elegir, lo escrito cuenta como la moneda
  const cerrar = () => { setAbierto(false); const m = limpiar(texto); if (m !== valor) onCambio(m); setTexto(m); };

  const tecla = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); if (!abierto) setAbierto(true); else setActiva((i) => Math.min(i + 1, opciones.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiva((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') {
      if (abierto && opciones[activa]) { e.preventDefault(); elegir(opciones[activa]); }
      else { const m = limpiar(texto); if (m !== valor) onCambio(m); }
    } else if (e.key === 'Escape') { if (abierto) { e.preventDefault(); setAbierto(false); setTexto(valor); } }
    else if (e.key === 'Tab') { if (abierto) cerrar(); }
  };

  return (
    <div className={`combo${compacto ? ' combo-sm' : ''}`} ref={caja}>
      <Search size={14} aria-hidden className="combo-ico" />
      <input
        id={id ?? idInput}
        className="input"
        role="combobox"
        aria-expanded={abierto}
        aria-controls={idLista}
        aria-autocomplete="list"
        aria-activedescendant={abierto && opciones[activa] ? `${idLista}-${activa}` : undefined}
        aria-invalid={invalido || undefined}
        value={texto}
        placeholder={placeholder}
        autoComplete="off"
        autoCapitalize="characters"
        spellCheck={false}
        autoFocus={autoFocus}
        onChange={(e) => { setTexto(e.target.value.toUpperCase()); setAbierto(true); }}
        onFocus={(e) => { e.target.select(); setAbierto(true); }}
        onClick={() => setAbierto(true)}
        onKeyDown={tecla}
      />
      <button type="button" className="combo-btn" tabIndex={-1} aria-label="Ver monedas" onClick={() => setAbierto((x) => !x)}><ChevronDown size={14} aria-hidden /></button>
      {abierto && (
        <ul className="combo-list" id={idLista} role="listbox" ref={lista}>
          {opciones.length ? opciones.map((m, i) => (
            <li
              key={m}
              id={`${idLista}-${i}`}
              data-i={i}
              role="option"
              aria-selected={i === activa}
              className={m === valor ? 'sel' : undefined}
              onMouseDown={(e) => { e.preventDefault(); elegir(m); }}
              onMouseEnter={() => setActiva(i)}
            >
              <span className="strong">{m}</span>
              <span className="faint">{todas.includes(m) ? `${m}USDT` : 'usar esta moneda'}</span>
            </li>
          )) : <li className="combo-empty">Escribe el nombre de la moneda</li>}
        </ul>
      )}
    </div>
  );
}
