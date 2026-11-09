// Lectura de mercado: BTC, Ballenas, Noticias y Escáner.
import { useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { ArrowDown, ArrowUp, ExternalLink, Info, RefreshCw, Search, ShieldAlert, Waves } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { ErrorEstado, Esqueleto, Filas, KV, LadoTag, Nota, Panel, Vacio } from '../components/ui';
import { MedidorDir } from '../components/graficos';
import { backend } from '../lib/api';
import { usePeticion } from '../lib/usar';
import { nombreExchange, conSigno, hace, hora, millones, numero, pct, pctSigno, precio as fp, usdt } from '../lib/formato';
import type { FiltroBTC, InformeBallenas, InformeBTC, InformeEscaner, InformeNoticias, FilaEscaner } from '../lib/tipos';

function Buscador({ valor, onBuscar, etiqueta = 'Moneda', placeholder = 'SOL', boton = 'Ver' }: { valor: string; onBuscar: (m: string) => void; etiqueta?: string; placeholder?: string; boton?: string }) {
  const [m, setM] = useState(valor);
  const enviar = (e: FormEvent) => { e.preventDefault(); onBuscar(m.trim().toUpperCase()); };
  return (
    <form className="search" onSubmit={enviar} role="search">
      <label className="sr-only" htmlFor={`b-${etiqueta}`}>{etiqueta}</label>
      <input id={`b-${etiqueta}`} className="input" value={m} onChange={(e) => setM(e.target.value.toUpperCase())} placeholder={placeholder} title={etiqueta} />
      <button className="btn btn-sm" type="submit"><Search size={14} aria-hidden />{boton}</button>
    </form>
  );
}

const tonoDir = (v: number) => (v > 0.15 ? 'gain' : v < -0.15 ? 'loss' : '');

// ---------------- BTC ----------------
export function Btc() {
  const [moneda, setMoneda] = useState('');
  const r = usePeticion(() => backend.motor<InformeBTC>('btc', moneda ? { moneda } : {}), [moneda]);
  const b = r.datos?.btc, alt = r.datos?.alt;
  const fila = (que: string, f: FiltroBTC) => ({ k: que, v: f.bloquea ? 'bloqueado por BTC' : f.estado + (f.bajar ? ' · baja un nivel' : ''), cls: f.bloquea || f.estado === 'en contra' ? 'loss' : f.estado === 'a favor' ? 'gain' : '' });
  return (
    <Pagina titulo="BTC" acciones={<><Buscador valor={moneda} onBuscar={setMoneda} etiqueta="Comparar con una altcoin" placeholder="Altcoin" boton="Comparar" /><button className="btn btn-sm icon-btn" onClick={r.run} disabled={r.cargando} aria-label="Actualizar"><RefreshCw size={14} /></button></>}>
      {r.cargando && !r.datos ? <Esqueleto filas={5} /> : r.error ? <ErrorEstado mensaje={r.error} reintentar={r.run} /> : b && (
        <div className="grid g-main">
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
            {alt && (
              <Panel titulo={`BTC frente a ${alt.base}`}>
                <Filas items={[
                  { k: 'Correlación (5m)', v: numero(alt.relacion.correlacion, 2) },
                  { k: 'Beta', v: numero(alt.relacion.beta, 2) },
                  { k: 'Peso de BTC en la señal', v: pct(alt.peso * 100, 0) },
                  fila('LONG de tendencia', alt.long), fila('SHORT de tendencia', alt.short),
                  fila('LONG de reversión', alt.long_rev), fila('SHORT de reversión', alt.short_rev),
                ]} />
              </Panel>
            )}
            <Panel titulo="Lectura"><ul className="list">{b.frases.map((f) => <li key={f}><Info size={14} aria-hidden />{f}</li>)}</ul></Panel>
          </div>
        </div>
      )}
    </Pagina>
  );
}

// ---------------- Ballenas ----------------
export function Ballenas() {
  const [moneda, setMoneda] = useState('SOL');
  const r = usePeticion(() => backend.motor<InformeBallenas>('ballenas', { moneda }), [moneda]);
  const b = r.datos, hl = b?.hl;
  const comp: Record<string, string> = { hl_posiciones: 'Posiciones en Hyperliquid', hl_flujo: 'Flujo de las ballenas', top_traders: 'Top traders vs minoristas', taker: 'Compra/venta agresiva', open_interest: 'Open interest', grandes: 'Operaciones grandes' };
  return (
    <Pagina titulo="Ballenas" acciones={<><Buscador valor={moneda} onBuscar={setMoneda} /><button className="btn btn-sm icon-btn" onClick={r.run} disabled={r.cargando} aria-label="Actualizar"><RefreshCw size={14} /></button></>}>
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
                <div className="table-wrap"><table className="t">
                  <thead><tr><th scope="col">Billetera</th><th scope="col">Lado</th><th scope="col" className="r">Valor</th><th scope="col" className="r">Entrada</th><th scope="col" className="r">PnL</th><th scope="col" className="r">Apal.</th><th scope="col" className="r">Convicción</th></tr></thead>
                  <tbody>{[...hl.posiciones].sort((a, c) => c.valor - a.valor).map((p) => (
                    <tr key={p.dir}>
                      <td className="num"><a href={`https://hypurrscan.io/address/${p.dir}`} target="_blank" rel="noreferrer">{p.nombre ?? `${p.dir.slice(0, 6)}…${p.dir.slice(-4)}`}</a></td>
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
    </Pagina>
  );
}

// ---------------- Noticias ----------------
export function Noticias() {
  const [monedas, setMonedas] = useState('SOL');
  const [horas, setHoras] = useState(24);
  const r = usePeticion(() => backend.motor<InformeNoticias>('noticias', { monedas: monedas.split(/[\s,]+/).filter(Boolean), horas }), [monedas, horas]);
  const n = r.datos;
  return (
    <Pagina titulo="Noticias" acciones={<><Buscador valor={monedas} onBuscar={setMonedas} etiqueta="Monedas separadas por coma" placeholder="SOL, NEAR" /><div className="seg" role="group" aria-label="Ventana">{[6, 24, 48].map((h) => <button key={h} aria-pressed={horas === h} onClick={() => setHoras(h)}>{h} h</button>)}</div></>}>
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
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}><span className="num" style={{ fontSize: 40, fontWeight: 750 }}>{n.fng.valor}</span><span style={{ fontWeight: 600 }}>{n.fng.clase}</span></div>
                <div className="meter-dir" style={{ marginTop: 10 }} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={n.fng.valor} aria-label="Fear & Greed"><span className="pin" style={{ left: `${n.fng.valor}%`, background: 'var(--text-2)' }} /></div>
                <div className="meter-scale"><span>Miedo extremo</span><span>Codicia extrema</span></div>
                {n.fng.ayer != null && <p className="muted" style={{ marginTop: 10 }}>Ayer: {n.fng.ayer}</p>}
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
type Orden = 'claridad' | 'confianza' | 'volumen_24h_musdt' | 'atr5_pct' | 'cambio_15m';
export function Escaner() {
  const r = usePeticion(() => backend.motor<InformeEscaner>('escaner', { top: 30 }), []);
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
    <Pagina titulo="Escáner" acciones={<button className="btn btn-sm" onClick={r.run} disabled={r.cargando}><RefreshCw size={14} aria-hidden />{r.cargando ? 'Escaneando…' : 'Escanear'}</button>}>
      {r.cargando && !e ? <Esqueleto filas={10} alto={14} /> : r.error ? <ErrorEstado mensaje={r.error} reintentar={r.run} /> : e && (
        <>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <span className="muted">{e.aptas} de {e.analizadas} monedas se mueven lo bastante frente a sus comisiones · {nombreExchange(e.exchange)} · BTC <span className={tonoDir(e.btc)}>{conSigno(e.btc)}</span> · {hace(e.ahora)}</span>
            <label className="muted" style={{ marginLeft: 'auto', display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}><input type="checkbox" checked={soloAptas} onChange={(x) => setSoloAptas(x.target.checked)} />Solo aptas para scalping</label>
          </div>
          <Panel flush>
            {filas.length ? (
              <div className="table-wrap"><table className="t">
                <thead><tr>{cab('claridad', 'Moneda')}<th scope="col">Sesgo</th>{cab('confianza', 'Confianza', true)}<th scope="col">Reversión</th>{cab('cambio_15m', '15 min', true)}{cab('atr5_pct', 'ATR 5m', true)}<th scope="col" className="r">Comisión</th>{cab('volumen_24h_musdt', 'Volumen 24 h', true)}<th scope="col" /></tr></thead>
                <tbody>{filas.map((x) => { const b = x.simbolo.replace(/_USDT$/, ''); return (
                  <tr key={x.simbolo}>
                    <td className="strong">{b}{x.cero_promo && <span className="tag" style={{ marginLeft: 6 }}>0 comisión</span>}{!x.apto && <span className="faint" style={{ marginLeft: 6, fontSize: 12 }}>{x.motivo_no_apto}</span>}</td>
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
