// Lectura de mercado: BTC, Ballenas, Noticias y Escáner.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ExternalLink, Info, RefreshCw, ShieldAlert, Waves, X } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { ErrorEstado, Esqueleto, Filas, KV, LadoTag, Nota, Panel, Vacio } from '../components/ui';
import { LineaSerie, MedidorDir, MedidorFNG } from '../components/graficos';
import { Sentimiento30 } from '../components/MercadoHoy';
import { SelectorMoneda } from '../components/SelectorMoneda';
import { backend } from '../lib/api';
import { usePeticion } from '../lib/usar';
import { nombreExchange, conSigno, hace, hora, millones, numero, pct, pctSigno, precio as fp, usdt } from '../lib/formato';
import type { ActivoMacro, Billetera, FiltroBTC, InformeBallenas, InformeBTC, InformeEscaner, InformeNoticias, FilaEscaner, SenalResumen } from '../lib/tipos';
import { useSesion } from '../lib/sesion';

function Buscador({ valor, onBuscar, etiqueta = 'Moneda', placeholder = 'SOL' }: { valor: string; onBuscar: (m: string) => void; etiqueta?: string; placeholder?: string }) {
  const id = `b-${etiqueta.replace(/\W+/g, '-')}`;
  return (
    <div className="search" role="search">
      <label className="sr-only" htmlFor={id}>{etiqueta}</label>
      <SelectorMoneda id={id} valor={valor} onCambio={onBuscar} placeholder={placeholder} compacto />
    </div>
  );
}

// Varias monedas (hasta 4): chips que se quitan y un selector para añadir.
function VariasMonedas({ valor, onCambio, max = 4 }: { valor: string[]; onCambio: (l: string[]) => void; max?: number }) {
  return (
    <div className="search" role="search">
      {valor.map((m) => (
        <button key={m} type="button" className="chip chip-x" aria-pressed="true" onClick={() => valor.length > 1 && onCambio(valor.filter((x) => x !== m))} aria-label={`Quitar ${m}`} disabled={valor.length === 1}>
          {m}{valor.length > 1 && <X size={12} aria-hidden />}
        </button>
      ))}
      {valor.length < max && (
        <>
          <label className="sr-only" htmlFor="noticias-mas">Añadir moneda</label>
          <SelectorMoneda key={valor.join()} id="noticias-mas" valor="" onCambio={(m) => m && !valor.includes(m) && onCambio([...valor, m])} placeholder="Añadir" excluir={valor} compacto />
        </>
      )}
    </div>
  );
}

const tonoDir = (v: number) => (v > 0.15 ? 'gain' : v < -0.15 ? 'loss' : '');

// ---------------- BTC ----------------
export function Btc() {
  const [moneda, setMoneda] = useState('');
  const r = usePeticion(() => backend.motor<InformeBTC>('btc', moneda ? { moneda } : {}), [moneda], { clave: `btc:${moneda}` });
  const b = r.datos?.btc;
  // la comparación solo vale si es de la moneda elegida (mientras carga otra, se muestra cargando)
  // (en demo solo hay datos grabados de una altcoin: se muestra esa con un aviso)
  const alt = moneda && r.datos?.alt && (r.datos.alt.base === moneda || backend.demo) ? r.datos.alt : null;
  return (
    <Pagina titulo={moneda ? `BTC · ${moneda}` : 'BTC'} acciones={<><Buscador valor={moneda} onBuscar={(x) => setMoneda(x === 'BTC' ? '' : x)} etiqueta="Comparar con una altcoin" placeholder="Comparar altcoin" /><button className="btn btn-sm icon-btn" onClick={r.run} disabled={r.cargando} aria-busy={r.cargando} aria-label={r.cargando ? 'Actualizando' : 'Actualizar'}><RefreshCw size={14} className={r.cargando ? 'girando' : undefined} aria-hidden /></button></>}>
      {r.cargando && !r.datos ? <Esqueleto filas={5} /> : r.error ? <ErrorEstado mensaje={r.error} reintentar={r.run} /> : b && (
        <div className="grid g-main">
          {moneda && (
            <section style={{ gridColumn: '1 / -1' }} aria-label={`${moneda} frente a BTC`} aria-busy={r.cargando}>
              {alt && backend.demo && alt.base !== moneda && <Nota tono="info">En modo demo solo hay datos grabados de {alt.base}: esta es su comparación, no la de {moneda}.</Nota>}
              {alt ? <AltFrenteBTC alt={alt} /> : r.cargando ? <Panel titulo={`${moneda} frente a BTC`}><Esqueleto filas={3} /></Panel> : (
                <Panel titulo={`${moneda} frente a BTC`}><p className="muted">No se pudo comparar {moneda} con BTC. Revisa que sea un perpetuo USDT.</p></Panel>
              )}
            </section>
          )}
          <div className="stack">
            <section className="panel" aria-label="Lectura de BTC">
              <div className="verdict">
                <span className={`verdict-word ${tonoDir(b.puntuacion) === 'gain' ? 'long' : tonoDir(b.puntuacion) === 'loss' ? 'short' : 'none'}`}>{b.lectura}</span>
                <div className="verdict-meta"><span className="t1 num">BTC {numero(b.precio, 1)}</span><span className="t2">fuerza {b.fuerza}{b.lateral ? ' · lateral' : ''} · {hace(r.datos!.ahora)}</span></div>
              </div>
              <div className="panel-b"><MedidorDir v={b.puntuacion} etiqueta="Dirección de BTC" /></div>
              <KV items={[
                { k: 'Puntuación', v: conSigno(b.puntuacion), cls: tonoDir(b.puntuacion) },
                { k: 'Tendencia mayor', v: conSigno(b.tendencia_mayor), cls: tonoDir(b.tendencia_mayor) },
                { k: 'Cambio 15 min', v: pctSigno(b.cambio_15m_pct, 3) },
                { k: 'Cambio 1 h', v: pctSigno(b.cambio_1h_pct, 3) },
                { k: 'RSI 5m', v: numero(b.rsi_5m, 1) },
                { k: 'ADX 15m', v: numero(b.adx15m, 1) },
              ]} />
            </section>
            <Panel titulo="Marcos de tiempo" flush>
              <div className="table-wrap"><table className="t"><thead><tr><th scope="col">Marco</th><th scope="col">Dirección</th><th scope="col" className="r">Puntuación</th><th scope="col" className="r">RSI</th><th scope="col" className="r">ADX</th></tr></thead>
                <tbody>{Object.entries(b.marcos).map(([k, m]) => (
                  <tr key={k}><td className="strong">{k}</td><td>{m.dir}</td><td className={`r num ${tonoDir(m.score)}`}>{conSigno(m.score)}</td><td className="r num">{numero(m.rsi, 1)}</td><td className="r num">{numero(m.adx, 1)}</td></tr>
                ))}</tbody></table></div>
            </Panel>
          </div>
          <div className="stack">
            <Panel titulo="Niveles de 5 min"><Filas items={[{ k: 'Resistencia', v: numero(b.resistencia_5m, 1) }, { k: 'Soporte', v: numero(b.soporte_5m, 1) }]} /></Panel>
            <Panel titulo="Lectura"><ul className="list">{b.frases.map((f) => <li key={f}><Info size={14} aria-hidden />{f}</li>)}</ul></Panel>
          </div>
          {r.datos?.macro?.activos.length ? <OroPetroleo activos={r.datos.macro.activos} /> : null}
        </div>
      )}
    </Pagina>
  );
}

// Una altcoin frente a BTC: su propia lectura (5m y 15m) y si BTC acompaña o va en contra de cada jugada.
function AltFrenteBTC({ alt }: { alt: NonNullable<InformeBTC['alt']> }) {
  const fila = (que: string, f: FiltroBTC) => ({ k: que, v: f.bloquea ? 'bloqueado por BTC' : f.estado + (f.bajar ? ' · baja un nivel' : ''), cls: f.bloquea || f.estado === 'en contra' ? 'loss' : f.estado === 'a favor' ? 'gain' : '' });
  const p = alt.puntuacion ?? 0;
  return (
    <div className="grid g-2">
      <section className="panel" aria-label={`Lectura de ${alt.base}`}>
        <div className="verdict">
          <span className={`verdict-word ${tonoDir(p) === 'gain' ? 'long' : tonoDir(p) === 'loss' ? 'short' : 'none'}`}>{alt.lectura ?? '—'}</span>
          <div className="verdict-meta"><span className="t1 num">{alt.base} {alt.precio != null ? fp(alt.precio) : '—'}</span><span className="t2">15 min {pctSigno(alt.cambio_15m_pct ?? null)} · 1 h {pctSigno(alt.cambio_1h_pct ?? null)}</span></div>
        </div>
        <div className="panel-b" style={{ display: 'grid', gap: 12 }}>
          <MedidorDir v={p} etiqueta={`Dirección de ${alt.base}`} />
          <Filas items={Object.entries(alt.marcos ?? {}).filter(([, x]) => x).map(([k, x]) => ({ k: `Marco ${k}`, v: `${x!.dir} · ${conSigno(x!.score)} · RSI ${numero(x!.rsi, 0)}`, cls: tonoDir(x!.score) }))} />
          <Link to={`/senal?moneda=${alt.base}`} style={{ fontSize: 13 }}>Pedir la señal completa de {alt.base}</Link>
        </div>
      </section>
      <Panel titulo={`¿BTC acompaña a ${alt.base}?`}>
        <Filas items={[
          { k: 'Correlación (5m)', v: numero(alt.relacion.correlacion, 2) },
          { k: 'Beta', v: `${numero(alt.relacion.beta, 2)} · si BTC se mueve 1 %, ${alt.base} ~${numero(alt.relacion.beta, 2)} %` },
          { k: 'Peso de BTC en la señal', v: pct(alt.peso * 100, 0) },
          fila('LONG de tendencia', alt.long), fila('SHORT de tendencia', alt.short),
          fila('LONG de reversión', alt.long_rev), fila('SHORT de reversión', alt.short_rev),
        ]} />
      </Panel>
    </div>
  );
}

// Oro y petróleo: cómo se mueven y cuánto se parecen a BTC. Contexto macro: solo avisan (y bajan un poco
// la confianza de la señal) cuando uno de los dos se mueve de golpe.
function OroPetroleo({ activos }: { activos: ActivoMacro[] }) {
  const dec = (x: number) => (x < 200 ? 2 : 1);
  const corr = (c: number | null) => (c == null ? 'sin dato' : Math.abs(c) < 0.3 ? `${numero(c, 2)} · casi no se mueve con BTC` : `${numero(c, 2)} · se mueve ${c > 0 ? 'con' : 'al revés que'} BTC`);
  return (
    <section className="stack" style={{ gridColumn: '1 / -1' }} aria-label="Oro y petróleo">
      <div className="grid g-2">
        {activos.map((a) => (
          <Panel key={a.clave} titulo={a.nombre} aside={a.choque ? <span className="tag tag-warn">movimiento brusco</span> : a.dia_volatil ? <span className="tag tag-warn">día volátil</span> : <span className="faint" style={{ fontSize: 12 }}>Binance · {a.simbolo}</span>}>
            <div style={{ display: 'grid', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
                <span className="num" style={{ fontSize: 26, fontWeight: 700 }}>{numero(a.precio, dec(a.precio))}</span>
                <span className={`num strong ${(a.cambio_24h ?? 0) >= 0 ? 'gain' : 'loss'}`}>{pctSigno(a.cambio_24h)} <span className="faint" style={{ fontWeight: 400 }}>24 h</span></span>
              </div>
              {a.serie && a.serie.length > 2 && (
                <LineaSerie puntos={a.serie.map((x) => ({ t: x.t, v: x.c }))} fmtV={(v) => numero(v, dec(v))} fmtT={(t) => hora(t)} etiqueta={`${a.nombre} en las últimas 24 h`} tono={(a.cambio_24h ?? 0) >= 0 ? 'var(--gain)' : 'var(--loss)'} alto={150} />
              )}
              <Filas items={[
                { k: 'Cambio 1 h · 4 h', v: `${pctSigno(a.cambio_1h)} · ${pctSigno(a.cambio_4h)}`, cls: a.choque ? 'warn' : '' },
                { k: 'Cambio 7 días', v: pctSigno(a.cambio_7d), cls: (a.cambio_7d ?? 0) >= 0 ? 'gain' : 'loss' },
                { k: 'Correlación con BTC (1 h, 7 días)', v: corr(a.correlacion_btc) },
              ]} />
            </div>
          </Panel>
        ))}
      </div>
      <Nota>En operaciones de 15 a 60 min el oro y el petróleo casi nunca marcan la dirección de BTC, así que no suman ni restan a la puntuación. Sí cuentan cuando uno se mueve de golpe (1.2 % el oro o 2 % el petróleo en una hora): suele ser una noticia macro que también sacude a las cripto, y la señal lo avisa y baja 5 puntos la confianza.</Nota>
    </section>
  );
}

// ---------------- Ballenas ----------------
export function Ballenas() {
  const [moneda, setMoneda] = useState('BTC');
  const r = usePeticion(() => backend.motor<InformeBallenas>('ballenas', { moneda }), [moneda], { clave: `ballenas:${moneda}` });
  const b = r.datos, hl = b?.hl;
  const [billetera, setBilletera] = useState<string | null>(null);
  const comp: Record<string, string> = { hl_posiciones: 'Posiciones en Hyperliquid', hl_flujo: 'Flujo de las ballenas', top_traders: 'Top traders vs minoristas', taker: 'Compra/venta agresiva', open_interest: 'Open interest', grandes: 'Operaciones grandes' };
  return (
    <Pagina titulo="Ballenas" acciones={<><Buscador valor={moneda} onBuscar={setMoneda} /><button className="btn btn-sm icon-btn" onClick={r.run} disabled={r.cargando} aria-busy={r.cargando} aria-label={r.cargando ? 'Actualizando' : 'Actualizar'}><RefreshCw size={14} className={r.cargando ? 'girando' : undefined} aria-hidden /></button></>}>
      {r.cargando && !b ? <Esqueleto filas={6} /> : r.error ? <ErrorEstado mensaje={r.error} reintentar={r.run} /> : b && (
        <div className="grid g-main">
          <div className="stack">
            <section className="panel" aria-label="Lectura de ballenas">
              <div className="verdict">
                <span className={`verdict-word ${tonoDir(b.puntuacion) === 'gain' ? 'long' : tonoDir(b.puntuacion) === 'loss' ? 'short' : 'none'}`}>{b.lectura}</span>
                <div className="verdict-meta"><span className="t1 num">{b.base} · {fp(b.precio, b.decimales)}</span><span className="t2">cobertura de datos {pct(b.cobertura * 100, 0)} · {hace(b.ahora)}</span></div>
              </div>
              <div className="panel-b"><MedidorDir v={b.puntuacion} etiqueta="Dirección del dinero grande" /></div>
              {hl?.disponible && (
                <div className="money">
                  <div><div className="k">{hl.longs} ballenas LONG</div><div className="v num gain">{millones(hl.valor_long)}</div><div className="s">USD en posición</div></div>
                  <div><div className="k">{hl.shorts} ballenas SHORT</div><div className="v num loss">{millones(hl.valor_short)}</div><div className="s">USD en posición</div></div>
                </div>
              )}
            </section>
            <Panel titulo="Posiciones de las ballenas en Hyperliquid" aside={hl?.criterio} flush>
              {hl?.disponible && hl.posiciones?.length ? (
                <div className="table-wrap"><p className="faint" style={{ fontSize: 12, padding: '10px 16px 0' }}>Toca una billetera para ver en qué otras monedas opera.</p><table className="t">
                  <thead><tr><th scope="col">Billetera</th><th scope="col">Lado</th><th scope="col" className="r">Valor</th><th scope="col" className="r">Entrada</th><th scope="col" className="r">PnL</th><th scope="col" className="r">Apal.</th><th scope="col" className="r">Convicción</th></tr></thead>
                  <tbody>{[...hl.posiciones].sort((a, c) => c.valor - a.valor).map((p) => (
                    <tr key={p.dir}>
                      <td className="num"><button type="button" className="link-btn" onClick={() => setBilletera(p.dir)} aria-haspopup="dialog">{p.nombre ?? `${p.dir.slice(0, 6)}…${p.dir.slice(-4)}`}</button></td>
                      <td><LadoTag lado={p.lado} size={12} /></td>
                      <td className="r num">{millones(p.valor)}</td><td className="r num">{fp(p.entrada, b.decimales)}</td>
                      <td className={`r num ${p.pnl >= 0 ? 'gain' : 'loss'}`}>{p.pnl >= 0 ? '+' : '−'}{millones(Math.abs(p.pnl))}</td>
                      <td className="r num">{p.apalancamiento}x</td><td className="r num">{pct(p.conviccion_pct, 0)}</td>
                    </tr>
                  ))}</tbody></table></div>
              ) : <Vacio icono={<Waves size={26} aria-hidden />} titulo="Sin ballenas con posición">{hl?.motivo ?? `Ninguna de las cuentas revisadas tiene posición en ${b.base}.`}</Vacio>}
            </Panel>
          </div>
          <div className="stack">
            <Panel titulo="Qué empuja la lectura">
              {Object.entries(b.componentes).filter(([, v]) => v != null).map(([k, v]) => (
                <div className="hbar" key={k}>
                  <span className="muted">{comp[k] ?? k}</span>
                  <span className="track" aria-hidden><span className="fill" style={{ width: `${Math.abs(v!) * 100}%`, background: v! >= 0 ? 'var(--gain)' : 'var(--loss)' }} /></span>
                  <span className={`val num ${tonoDir(v!)}`}>{conSigno(v!)}</span>
                </div>
              ))}
            </Panel>
            {hl?.disponible && hl.flujo_1h && (
              <Panel titulo="Flujo de las ballenas" flush>
                <div className="table-wrap"><table className="t"><thead><tr><th scope="col">Ventana</th><th scope="col" className="r">Abrieron L / S</th><th scope="col" className="r">Cerraron L / S</th></tr></thead>
                  <tbody>{(['flujo_1h', 'flujo_4h', 'flujo_24h'] as const).map((k) => { const f = hl[k]!; return (
                    <tr key={k}><td>{k.replace('flujo_', '')}</td><td className="r num">{millones(f.abrieron_long)} / {millones(f.abrieron_short)}</td><td className="r num">{millones(f.cerraron_long)} / {millones(f.cerraron_short)}</td></tr>
                  ); })}</tbody></table></div>
              </Panel>
            )}
            <Panel titulo="Muros del libro">
              <Filas items={[
                { k: 'Muro de venta', v: b.muros?.venta ? `${fp(b.muros.venta.precio, b.decimales)} · ${millones(b.muros.venta.usd)}` : '—', cls: 'loss' },
                { k: 'Muro de compra', v: b.muros?.compra ? `${fp(b.muros.compra.precio, b.decimales)} · ${millones(b.muros.compra.usd)}` : '—', cls: 'gain' },
                { k: 'Top traders LONG', v: b.posicionamiento?.top_long != null ? pct(b.posicionamiento.top_long * 100, 0) : '—' },
                { k: 'Minoristas LONG', v: b.posicionamiento?.minoristas_long != null ? pct(b.posicionamiento.minoristas_long * 100, 0) : '—' },
                { k: 'Open interest 15 min', v: b.oi ? `${pctSigno(b.oi.cambio_15m_pct)} · ${b.oi.tipo}` : '—' },
              ]} />
            </Panel>
            <Panel titulo="Lectura">
              <ul className="list">{b.frases.map((f) => <li key={f}><Info size={14} aria-hidden />{f}</li>)}</ul>
              {b.desde_anterior?.frases?.length ? <><h3 style={{ fontSize: 13, margin: '14px 0 6px' }}>Desde tu revisión anterior</h3><ul className="list">{b.desde_anterior.frases.map((f) => <li key={f}><Info size={14} aria-hidden />{f}</li>)}</ul></> : null}
            </Panel>
          </div>
        </div>
      )}
      {billetera && <VerBilletera dir={billetera} onCerrar={() => setBilletera(null)} />}
    </Pagina>
  );
}

// Una ballena entera: todas sus posiciones abiertas y lo que hizo en 24 h (para seguirla, tipo copytrading).
function VerBilletera({ dir, onCerrar }: { dir: string; onCerrar: () => void }) {
  const r = usePeticion(() => backend.motor<Billetera>('billetera', { dir }), [dir], { clave: `billetera:${dir}` });
  const cerrar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cerrar.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCerrar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCerrar]);
  const w = r.datos;
  const dec = (x: number) => (x < 1 ? 5 : x < 100 ? 3 : 1);
  return (
    <div className="dialog-back" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="dialog dialog-ancho" role="dialog" aria-modal="true" aria-labelledby="bill-t">
        <header className="panel-h">
          <h2 id="bill-t">Billetera <span className="num">{(w?.dir ?? dir).slice(0, 6)}…{(w?.dir ?? dir).slice(-4)}</span></h2>
          <button ref={cerrar} type="button" className="btn btn-sm icon-btn" onClick={onCerrar} aria-label="Cerrar"><X size={16} /></button>
        </header>
        <div className="panel-b dialog-scroll" style={{ display: 'grid', gap: 14 }}>
          {r.cargando && !w ? <Esqueleto filas={5} /> : r.error ? <ErrorEstado mensaje={r.error} reintentar={r.run} /> : w && (
            <>
              <KV items={[
                { k: 'Cuenta', v: millones(w.cuenta), s: 'USD en Hyperliquid' },
                { k: 'PnL abierto', v: `${w.pnl_abierto >= 0 ? '+' : '−'}${millones(Math.abs(w.pnl_abierto))}`, cls: w.pnl_abierto >= 0 ? 'gain' : 'loss' },
                { k: 'En LONG / SHORT', v: `${millones(w.valor_long)} / ${millones(w.valor_short)}`, s: `neto ${w.neto >= 0 ? 'LONG' : 'SHORT'} ${pct(Math.abs(w.neto) * 100, 0)}` },
              ]} />
              <h3 style={{ fontSize: 14 }}>Posiciones abiertas ({w.posiciones.length})</h3>
              {w.posiciones.length ? (
                <div className="table-wrap"><table className="t">
                  <thead><tr><th scope="col">Moneda</th><th scope="col">Lado</th><th scope="col" className="r">Valor</th><th scope="col" className="r hide-sm">Entrada</th><th scope="col" className="r">PnL</th><th scope="col" className="r hide-sm">Apal.</th><th scope="col" className="r hide-sm">Liq.</th><th scope="col" /></tr></thead>
                  <tbody>{w.posiciones.map((p) => (
                    <tr key={p.coin}>
                      <td className="strong">{p.moneda}</td><td><LadoTag lado={p.lado} size={12} /></td>
                      <td className="r num">{millones(p.valor)}</td><td className="r num hide-sm">{numero(p.entrada, dec(p.entrada))}</td>
                      <td className={`r num ${p.pnl >= 0 ? 'gain' : 'loss'}`}>{p.pnl >= 0 ? '+' : '−'}{millones(Math.abs(p.pnl))}{p.roe_pct != null && <span className="sub-line">{pctSigno(p.roe_pct, 0)}</span>}</td>
                      <td className="r num hide-sm">{p.apalancamiento ? `${p.apalancamiento}x` : '—'}</td><td className="r num hide-sm">{p.liquidacion ? numero(p.liquidacion, dec(p.liquidacion)) : '—'}</td>
                      <td className="r"><Link className="btn btn-sm" to={`/senal?moneda=${p.moneda}`} onClick={onCerrar}>Señal</Link></td>
                    </tr>
                  ))}</tbody></table></div>
              ) : <p className="muted">No tiene posiciones abiertas ahora.</p>}
              {w.actividad_24h.length > 0 && (
                <>
                  <h3 style={{ fontSize: 14 }}>Qué hizo en 24 h</h3>
                  <div className="table-wrap"><table className="t">
                    <thead><tr><th scope="col">Moneda</th><th scope="col" className="r">Abrió L / S</th><th scope="col" className="r">Cerró L / S</th></tr></thead>
                    <tbody>{w.actividad_24h.map((a) => (
                      <tr key={a.coin}><td className="strong">{a.moneda}</td><td className="r num">{millones(a.abrieron_long)} / {millones(a.abrieron_short)}</td><td className="r num">{millones(a.cerraron_long)} / {millones(a.cerraron_short)}</td></tr>
                    ))}</tbody></table></div>
                </>
              )}
              <Nota tono="warn" titulo="Copiar a una ballena tiene trampa:">sus posiciones suelen durar días o semanas, con otro tamaño y otro stop. Úsalo como contexto y pide la señal de la moneda antes de entrar.</Nota>
              <a href={`https://hypurrscan.io/address/${w.dir}`} target="_blank" rel="noreferrer" style={{ fontSize: 13 }}>Ver en Hypurrscan <ExternalLink size={12} aria-hidden style={{ verticalAlign: -1 }} /></a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------- Noticias ----------------
export function Noticias() {
  const [monedas, setMonedas] = useState<string[]>(['BTC']);
  const [horas, setHoras] = useState(24);
  const r = usePeticion(() => backend.motor<InformeNoticias>('noticias', { monedas, horas }), [monedas.join(','), horas], { clave: `noticias:${monedas.join(',')}:${horas}` });
  const n = r.datos;
  return (
    <Pagina titulo="Noticias" acciones={<><VariasMonedas valor={monedas} onCambio={setMonedas} /><div className="seg" role="group" aria-label="Ventana">{[6, 24, 48].map((h) => <button key={h} aria-pressed={horas === h} onClick={() => setHoras(h)}>{h} h</button>)}</div></>}>
      {r.cargando && !n ? <Esqueleto filas={6} /> : r.error ? <ErrorEstado mensaje={r.error} reintentar={r.run} /> : n && (
        <div className="grid g-main">
          <div className="stack">
            {n.monedas.map((m) => (
              <Panel key={m.moneda} titulo={`${m.moneda}: ${m.propias.length} noticias`} aside={<span className={`tag ${m.sentimiento > 0 ? 'tag-gain' : m.sentimiento < 0 ? 'tag-loss' : ''} num`}>sentimiento {conSigno(m.sentimiento, 1)}</span>} flush>
                {m.evento_riesgo && <div className="panel-b"><Nota tono="loss" titulo="Evento de riesgo:">{m.evento_riesgo}</Nota></div>}
                {m.propias.length ? <ListaNoticias items={m.propias} /> : <Vacio icono={<Info size={24} aria-hidden />} titulo="Sin noticias propias">Nada sobre {m.moneda} en las últimas {horas} h en Cointelegraph, Decrypt ni CoinDesk.</Vacio>}
                {m.errores.length > 0 && <div className="panel-b faint" style={{ fontSize: 12 }}>Fuentes con error: {m.errores.join('; ')}</div>}
              </Panel>
            ))}
          </div>
          <div className="stack">
            {n.fng && (
              <Panel titulo="Fear & Greed">
                <div style={{ display: 'grid', gap: 16 }}>
                  <MedidorFNG valor={n.fng.valor} clase={n.fng.clase} ayer={n.fng.ayer} semana={n.fng.semana} />
                  <Sentimiento30 fng={n.fng} />
                </div>
              </Panel>
            )}
            <Panel titulo="Mercado general" flush>{n.monedas[0]?.macro.length ? <ListaNoticias items={n.monedas[0].macro.slice(0, 8)} /> : <div className="panel-b muted">Sin titulares macro.</div>}</Panel>
            <p className="faint" style={{ fontSize: 12 }}>El sentimiento es un conteo de palabras clave en inglés, orientativo. Lee el titular antes de decidir.</p>
          </div>
        </div>
      )}
    </Pagina>
  );
}

function ListaNoticias({ items }: { items: InformeNoticias['monedas'][number]['propias'] }) {
  return (
    <div className="news">{items.map((x) => (
      <a className="item" key={x.titulo} href={x.enlace} target="_blank" rel="noreferrer">
        <span className={`tag ${x.sentimiento > 0 ? 'tag-gain' : x.sentimiento < 0 ? 'tag-loss' : ''} num`} aria-label={`sentimiento ${x.sentimiento}`}>{x.sentimiento > 0 ? '+' : x.sentimiento < 0 ? '−' : '0'}</span>
        <span>
          <span className="ttl">{x.riesgo && <ShieldAlert size={14} aria-label="riesgo" className="loss" style={{ verticalAlign: -2, marginRight: 4 }} />}{x.titulo}</span>
          <span className="meta" style={{ display: 'block' }}>{x.fuente} · {hora(x.fecha)} · {hace(x.fecha)} {x.enlace && <ExternalLink size={11} aria-hidden style={{ verticalAlign: -1 }} />}</span>
          {x.resumen && <span className="res">{x.resumen}</span>}
        </span>
      </a>
    ))}</div>
  );
}

// ---------------- Escáner ----------------
// Confirma las 3 mejores aptas con la señal completa, una llamada por moneda (2 a la vez): en una sola
// llamada no cabe en la Edge Function. Los resultados se guardan en la caché del escáner.
const CONFIRMAR = 3;
const PESO = (s?: SenalResumen) => (!s || s.error ? 0 : s.recomendacion && s.recomendacion !== 'NO OPERAR' ? 3 : s.mejor ? 1 : 0.5);
function useConfirmar(e: InformeEscaner | null, setDatos: (v: (p: InformeEscaner | null) => InformeEscaner | null) => void, capital?: number) {
  const [estado, setEstado] = useState<{ hechas: number; total: number } | null>(null);
  const lanzado = useRef<InformeEscaner | null>(null);
  useEffect(() => {
    if (!e || backend.demo || lanzado.current === e || e.filas.some((x) => x.senal)) return;
    lanzado.current = e;
    const elegidas = e.filas.filter((x) => x.apto).slice(0, CONFIRMAR);
    if (!elegidas.length) return;
    const ahora = e.ahora;
    const res = new Map<string, SenalResumen>();
    let hechas = 0;
    setEstado({ hechas: 0, total: elegidas.length });
    const aplicar = (final: boolean) => setDatos((p) => {
      if (!p || p.ahora !== ahora) return p; // otro escaneo ya reemplazó a este
      let filas = p.filas.map((f) => (res.has(f.simbolo) ? { ...f, senal: res.get(f.simbolo) } : f));
      if (final) filas = [...filas].sort((a, b) => (Number(b.apto) - Number(a.apto)) || PESO(b.senal) - PESO(a.senal) || (b.senal?.confianza ?? b.confianza) - (a.senal?.confianza ?? a.confianza));
      return { ...p, filas, confirmadas: [...res.values()].filter((s) => !s.error).length };
    });
    const cola = [...elegidas];
    const trabajador = async () => {
      for (let x = cola.shift(); x; x = cola.shift()) {
        const moneda = x.simbolo.replace(/_USDT$/, '');
        try {
          const r = await backend.motor<{ resumen?: SenalResumen; bloqueado?: boolean; motivo?: string }>('senal', { moneda, capital, resumen: true });
          res.set(x.simbolo, r.resumen ?? { error: r.motivo ?? 'sin datos' });
        } catch (err) { res.set(x.simbolo, { error: (err as Error).message }); }
        hechas++;
        if (lanzado.current === e) setEstado({ hechas, total: elegidas.length });
        aplicar(false);
      }
    };
    Promise.all([trabajador(), trabajador()]).then(() => { aplicar(true); if (lanzado.current === e) setEstado(null); });
  }, [e, setDatos, capital]);
  return estado;
}

// Resultado de la señal completa para una fila confirmada.
function CeldaSenal({ s }: { s?: SenalResumen }) {
  if (!s) return <span className="faint">—</span>;
  if (s.error) return <span className="faint" title={s.error}>sin datos</span>;
  if (s.recomendacion && s.recomendacion !== 'NO OPERAR') return <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><LadoTag lado={s.recomendacion} size={12} /><span className="faint" style={{ fontSize: 12 }}>{s.nivel?.toLowerCase()}</span></span>;
  return (
    <span title={s.motivo ?? undefined} style={{ display: 'grid', justifyItems: 'start', gap: 2 }}>
      <span className="tag">NO OPERAR</span>
      {s.mejor && <span className="faint" style={{ fontSize: 12 }}>mejor posible {s.mejor.lado}{s.mejor.prob != null ? ` ${pct(s.mejor.prob, 0)}` : ''}</span>}
    </span>
  );
}

type Orden = 'claridad' | 'confianza' | 'volumen_24h_musdt' | 'atr5_pct' | 'cambio_15m';
export function Escaner() {
  const { estado } = useSesion();
  const r = usePeticion(() => backend.motor<InformeEscaner>('escaner', { top: 30, confirmar: 0 }), [], { clave: 'escaner' });
  const conf = useConfirmar(r.datos, r.setDatos, estado?.diario?.capital);
  const [orden, setOrden] = useState<Orden>('claridad');
  const [desc, setDesc] = useState(true);
  const [soloAptas, setSoloAptas] = useState(true);
  const e = r.datos;
  const filas = useMemo(() => {
    if (!e) return [];
    const f = e.filas.filter((x) => !soloAptas || x.apto);
    if (orden === 'claridad') return f; // el motor ya las ordena por claridad del setup
    const v = (x: FilaEscaner) => (x[orden] ?? -Infinity) as number;
    return [...f].sort((a, b) => (desc ? v(b) - v(a) : v(a) - v(b)));
  }, [e, orden, desc, soloAptas]);
  const cab = (k: Orden, t: string, r?: boolean) => (
    <th scope="col" className={r ? 'r' : ''} aria-sort={orden === k ? (desc ? 'descending' : 'ascending') : 'none'}>
      <button onClick={() => (orden === k ? setDesc(!desc) : (setOrden(k), setDesc(true)))}>{t}{orden === k && k !== 'claridad' && (desc ? <ArrowDown size={12} aria-hidden /> : <ArrowUp size={12} aria-hidden />)}</button>
    </th>
  );
  return (
    <Pagina titulo="Escáner" acciones={<button className="btn btn-sm" onClick={r.run} disabled={r.cargando} aria-busy={r.cargando}><RefreshCw size={14} aria-hidden className={r.cargando ? 'girando' : undefined} />{r.cargando ? 'Escaneando…' : 'Escanear'}</button>}>
      {r.cargando && !e ? <Esqueleto filas={10} alto={14} /> : r.error ? <ErrorEstado mensaje={r.error} reintentar={r.run} /> : e && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted">{e.aptas} de {e.analizadas} monedas se mueven lo bastante frente a sus comisiones · {nombreExchange(e.exchange)} · BTC <span className={tonoDir(e.btc)}>{conSigno(e.btc)}</span> · {hace(e.ahora)}</span>
            <label className="muted" style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={soloAptas} onChange={(x) => setSoloAptas(x.target.checked)} />Solo aptas para scalping</label>
          </div>
          {conf && <div className="muted" role="status" style={{ fontSize: 13, display: 'flex', gap: 8, alignItems: 'center' }}><RefreshCw size={14} className="girando" aria-hidden />Confirmando con la señal completa: {conf.hechas} de {conf.total}…</div>}
          <Nota tono="info" titulo="Señal completa:">{conf ? 'las 3 mejores están pasando ahora por el mismo análisis de la pantalla Señal; la columna se va llenando.' : e.confirmadas ? `las ${e.confirmadas} mejores ya pasaron por el mismo análisis de la pantalla Señal (historial real, BTC, ballenas, Fear & Greed): esa columna es lo que te dirá al analizarlas.` : 'en este escaneo no se confirmó ninguna moneda con la señal completa.'} El resto solo pasó el filtro rápido (tendencia, momentum y BTC): su confianza no es la de la señal.</Nota>
          <Panel flush>
            {filas.length ? (
              <div className="table-wrap"><table className="t">
                <thead><tr>{cab('claridad', 'Moneda')}<th scope="col">Señal completa</th><th scope="col">Sesgo rápido</th>{cab('confianza', 'Confianza', true)}<th scope="col">Reversión</th>{cab('cambio_15m', '15 min', true)}{cab('atr5_pct', 'ATR 5m', true)}<th scope="col" className="r">Comisión</th>{cab('volumen_24h_musdt', 'Volumen 24 h', true)}<th scope="col" /></tr></thead>
                <tbody>{filas.map((x) => { const b = x.simbolo.replace(/_USDT$/, ''); return (
                  <tr key={x.simbolo}>
                    <td className="strong">{b}{x.cero_promo && <span className="tag" style={{ marginLeft: 6 }}>0 comisión</span>}{!x.apto && <span className="faint" style={{ marginLeft: 6, fontSize: 12 }}>{x.motivo_no_apto}</span>}</td>
                    <td><CeldaSenal s={x.senal} /></td>
                    <td>{x.nivel === 'NO OPERAR' ? <span className="faint">lateral</span> : <LadoTag lado={x.sesgo} size={12} />}</td>
                    <td className="r num">{x.confianza}</td>
                    <td>{x.reversion ? <><LadoTag lado={x.reversion.lado} size={12} /> <span className="faint num">{x.reversion.confianza}</span></> : <span className="faint">—</span>}</td>
                    <td className={`r num ${x.cambio_15m != null && x.cambio_15m > 0 ? 'gain' : x.cambio_15m != null && x.cambio_15m < 0 ? 'loss' : ''}`}>{pctSigno(x.cambio_15m)}</td>
                    <td className="r num">{pct(x.atr5_pct, 2)}</td><td className="r num">{pct(x.comision_pct, 3)}</td><td className="r num">{usdt(x.volumen_24h_musdt, 1).replace(' USDT', ' M')}</td>
                    <td className="r"><Link className="btn btn-sm" to={`/senal?moneda=${b}`}>Señal</Link></td>
                  </tr>
                ); })}</tbody></table></div>
            ) : <Vacio icono={<Info size={24} aria-hidden />} titulo="Ninguna moneda apta ahora">El mercado se mueve poco frente a las comisiones. Desmarca «Solo aptas» para verlas todas, o vuelve en un rato.</Vacio>}
          </Panel>
        </>
      )}
    </Pagina>
  );
}
