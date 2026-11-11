// Mercado: vista general de todo lo que mueve el precio hoy (BTC, ETH, SOL, oro y petróleo, sentimiento,
// dominancia de BTC y de las stablecoins, datos macro del día, noticias, ballenas y bots). Al elegir una
// moneda, la vista se filtra: esa moneda frente a BTC, sus ballenas, sus bots y sus noticias.
import { Link } from 'react-router-dom';
import { useState } from 'react';
import { Bot, RefreshCw, Waves, Zap } from 'lucide-react';
import { Pagina } from '../components/Shell';
import { ErrorEstado, Esqueleto, Filas, Nota, Panel } from '../components/ui';
import { MedidorFNG } from '../components/graficos';
import { PanelCalendario } from '../components/Calendario';
import { PanelAperturas } from '../components/Aperturas';
import { AltFrenteBTC, Buscador, DetalleBTC, ListaNoticias, OroPetroleo } from './Mercado';
import { backend } from '../lib/api';
import { usePeticion } from '../lib/usar';
import { conSigno, millones, numero, pct, pctSigno, precio as fp } from '../lib/formato';
import type { Bots, InformeBallenas, InformeBTC, InformeMercado, InformeNoticias, InformePanorama, LecturaMoneda } from '../lib/tipos';

const tono = (v: number | null | undefined) => (v == null ? '' : v > 0 ? 'gain' : v < 0 ? 'loss' : '');
const tonoLectura = (l: string) => (/ALCISTA|COMPRADORES/.test(l) ? 'tag-gain' : /BAJISTA|VENDEDORES/.test(l) ? 'tag-loss' : '');

function Tarjeta({ titulo, precio, dec, c1h, c24h, lectura, sub }: { titulo: string; precio: number; dec: number; c1h: number | null; c24h: number | null; lectura?: string; sub?: string }) {
  return (
    <section className="panel" aria-label={titulo} style={{ padding: 14, display: 'grid', gap: 6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
        <b>{titulo}</b>{lectura && <span className={`tag ${tonoLectura(lectura)}`}>{lectura}</span>}
      </div>
      <div className="num" style={{ fontSize: 22, fontWeight: 700 }}>{fp(precio, dec)}</div>
      <div className="num muted" style={{ fontSize: 13 }}>1 h <span className={tono(c1h)}>{pctSigno(c1h)}</span> · 24 h <span className={tono(c24h)}>{pctSigno(c24h)}</span></div>
      {sub && <div className="faint" style={{ fontSize: 12 }}>{sub}</div>}
    </section>
  );
}
const dec = (p: number) => (p >= 1000 ? 1 : p >= 10 ? 2 : 4);

export function PanelBots({ b, moneda, className = '' }: { b: Bots; moneda: string; className?: string }) {
  const a = b.algoritmico;
  return (
    <Panel titulo={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Bot size={16} aria-hidden />Bots de trading en {moneda}</span>} aside={<span className={`tag ${tonoLectura(b.lectura)}`}>{b.lectura === 'NEUTRAL' ? 'neutrales' : b.lectura.toLowerCase()}</span>} className={className}>
      <div style={{ display: 'grid', gap: 10 }}>
        {b.frases.length ? <ul className="list">{b.frases.map((f) => <li key={f}>{f}</li>)}</ul> : <p className="muted">Sin huella clara de bots ahora.</p>}
        {a && <Filas items={[{ k: `Órdenes algorítmicas (últimas ${a.operaciones} operaciones, ${a.segundos} s)`, v: `${millones(a.compras_usd)} / ${millones(a.ventas_usd)}`, cls: tono(a.neto) }]} />}
        <p className="faint" style={{ fontSize: 12 }}>Nadie publica las posiciones de los bots: se miden por su huella (órdenes del mismo tamaño repetidas, escaleras en el libro y el inventario de los market makers de Hyperliquid). En la señal pesan poco: ±3 de confianza.</p>
      </div>
    </Panel>
  );
}

function ResumenBallenas({ b, moneda }: { b: InformeBallenas; moneda: string }) {
  const hl = b.hl;
  const tot = (hl?.valor_long ?? 0) + (hl?.valor_short ?? 0);
  return (
    <Panel titulo={<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><Waves size={16} aria-hidden />Ballenas en {moneda}</span>} aside={<span className={`tag ${tonoLectura(b.lectura)}`}>{b.lectura}</span>}>
      <div style={{ display: 'grid', gap: 10 }}>
        {hl?.disponible && tot > 0 && (
          <div>
            <div className="split-bar" role="img" aria-label={`Hyperliquid: ${hl.longs} ballenas LONG con ${millones(hl.valor_long)} y ${hl.shorts} SHORT con ${millones(hl.valor_short)}`}>
              <i style={{ width: `${(100 * (hl.valor_long ?? 0)) / tot}%`, background: 'var(--gain)' }} /><i style={{ width: `${(100 * (hl.valor_short ?? 0)) / tot}%`, background: 'var(--loss)' }} />
            </div>
            <div className="prob-legend" style={{ marginTop: 8 }}>
              <span><i className="sw" style={{ background: 'var(--gain)' }} aria-hidden />{hl.longs} LONG <b className="num">{millones(hl.valor_long)}</b></span>
              <span><i className="sw" style={{ background: 'var(--loss)' }} aria-hidden />{hl.shorts} SHORT <b className="num">{millones(hl.valor_short)}</b></span>
            </div>
          </div>
        )}
        <ul className="list">{b.frases.slice(0, 4).map((f) => <li key={f}>{f}</li>)}</ul>
        <Link to={`/ballenas`} style={{ fontSize: 13 }}>Ver todas las posiciones y billeteras</Link>
      </div>
    </Panel>
  );
}

export function Panorama() {
  const [moneda, setMoneda] = useState('');
  const base = moneda || 'BTC';
  const btc = usePeticion(() => backend.motor<InformeBTC>('btc', moneda ? { moneda } : {}), [moneda], { clave: `btc:${moneda}` });
  const pan = usePeticion(() => backend.motor<InformePanorama>('panorama'), [], { clave: 'panorama' });
  const mer = usePeticion(() => backend.motor<InformeMercado>('mercado'), [], { clave: 'mercado' });
  const bal = usePeticion(() => backend.motor<InformeBallenas>('ballenas', { moneda: base }), [base], { clave: `ballenas:${base}` });
  const not = usePeticion(() => backend.motor<InformeNoticias>('noticias', { monedas: [base], horas: 24 }), [base], { clave: `noticias:${base}:24` });
  const todas = [btc, pan, mer, bal, not];
  const cargando = todas.some((x) => x.cargando);
  const refrescar = () => todas.forEach((x) => x.run());

  const b = btc.datos?.btc, alt = moneda && btc.datos?.alt && (btc.datos.alt.base === moneda || backend.demo) ? btc.datos.alt : null;
  const macro = btc.datos?.macro?.activos ?? [];
  const n = not.datos?.monedas?.[0];
  const d = pan.datos?.dominancia;
  const btcPan = pan.datos?.monedas?.find((m) => m.base === 'BTC');
  const otras = (pan.datos?.monedas ?? []).filter((m: LecturaMoneda) => m.base !== moneda && m.base !== 'BTC');

  return (
    <Pagina titulo={moneda ? `Mercado · ${moneda}` : 'Mercado'} acciones={<>
      <Buscador valor={moneda} onBuscar={(x) => setMoneda(x === 'BTC' ? '' : x)} etiqueta="Filtrar por moneda" placeholder="Filtrar moneda" />
      {moneda && <button className="btn btn-sm" onClick={() => setMoneda('')}>Vista general</button>}
      <button className="btn btn-sm icon-btn" onClick={refrescar} disabled={cargando} aria-busy={cargando} aria-label={cargando ? 'Actualizando' : 'Actualizar'}><RefreshCw size={14} className={cargando ? 'girando' : undefined} aria-hidden /></button>
    </>}>
      {/* Precios: BTC, ETH, SOL, oro y petróleo */}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        {b ? <Tarjeta titulo="BTC" precio={b.precio} dec={1} c1h={b.cambio_1h_pct} c24h={btcPan?.cambio_24h_pct ?? null} lectura={b.lectura} sub={`fuerza ${b.fuerza}`} /> : <Esqueleto filas={2} />}
        {otras.map((m) => <Tarjeta key={m.base} titulo={m.base} precio={m.precio} dec={dec(m.precio)} c1h={m.cambio_1h_pct} c24h={m.cambio_24h_pct} lectura={m.lectura} />)}
        {macro.map((a) => <Tarjeta key={a.simbolo} titulo={a.nombre} precio={a.precio} dec={2} c1h={a.cambio_1h} c24h={a.cambio_24h} sub={a.choque ? 'movimiento brusco' : undefined} />)}
      </div>

      {moneda && (
        <section aria-label={`${moneda} frente a BTC`}>
          {alt && backend.demo && alt.base !== moneda && <Nota tono="info">En modo demo solo hay datos grabados de {alt.base}: esta es su comparación, no la de {moneda}.</Nota>}
          {alt ? <AltFrenteBTC alt={alt} /> : btc.cargando ? <Panel titulo={`${moneda} frente a BTC`}><Esqueleto filas={3} /></Panel>
            : btc.error ? <ErrorEstado mensaje={btc.error} reintentar={btc.run} /> : <Panel titulo={`${moneda} frente a BTC`}><p className="muted">No se pudo leer {moneda}. Revisa que sea un perpetuo USDT.</p></Panel>}
          <p style={{ marginTop: 8 }}><Link className="btn btn-primary btn-sm" to={`/senal?moneda=${moneda}`}><Zap size={14} aria-hidden />Pedir la señal de {moneda}</Link></p>
        </section>
      )}

      {!moneda && <PanelAperturas horas={24} />}
      <div className="grid g-2">
        {/* Sentimiento y dominancia */}
        <Panel titulo="Sentimiento y dominancia">
          <div style={{ display: 'grid', gap: 12 }}>
            {mer.datos?.fng ? <MedidorFNG valor={mer.datos.fng.valor} clase={mer.datos.fng.clase} ayer={mer.datos.fng.ayer} semana={mer.datos.fng.semana} /> : mer.cargando ? <Esqueleto filas={2} /> : null}
            {d ? (
              <>
                <Filas items={[
                  { k: 'Dominancia de BTC', v: pct(d.btc_pct, 2) },
                  { k: 'Dominancia de USDT (USDT + USDC)', v: `${pct(d.usdt_pct, 2)} (${pct(d.estables_pct, 2)})` },
                  { k: 'Capitalización cripto 24 h', v: `${d.capitalizacion_usd ? `${numero(d.capitalizacion_usd / 1e12, 2)} billones` : '—'} USD · ${pctSigno(d.cambio_cap_24h_pct)}`, cls: tono(d.cambio_cap_24h_pct) },
                ]} />
                {d.lectura && <p className="muted" style={{ fontSize: 13 }}>{d.lectura}</p>}
                <p className="faint" style={{ fontSize: 12 }}>Si la dominancia de USDT sube, el dinero sale de las cripto a refugio (bajista); si baja, vuelve a entrar. Fuente: CoinGecko.</p>
              </>
            ) : pan.cargando ? <Esqueleto filas={2} /> : <p className="muted">Dominancia no disponible ahora.</p>}
            {mer.datos?.amplitud && <Filas items={[{ k: 'Monedas que suben hoy', v: `${mer.datos.amplitud.suben} de ${mer.datos.amplitud.total} (${pct(mer.datos.amplitud.pct_suben, 0)})`, cls: tono((mer.datos.amplitud.pct_suben ?? 50) - 50) }, { k: 'Funding medio', v: mer.datos.funding_medio_pct != null ? `${conSigno(mer.datos.funding_medio_pct, 4)} %` : '—' }]} />}
          </div>
        </Panel>
        {/* Datos macro del día */}
        {mer.datos?.calendario ? <PanelCalendario c={mer.datos.calendario} max={6} /> : mer.cargando ? <Panel titulo="Calendario económico"><Esqueleto filas={3} /></Panel> : <Panel titulo="Calendario económico"><p className="muted">No disponible ahora.</p></Panel>}
      </div>

      <div className="grid g-2">
        {bal.datos ? <ResumenBallenas b={bal.datos} moneda={base} /> : bal.cargando ? <Panel titulo={`Ballenas en ${base}`}><Esqueleto filas={3} /></Panel> : bal.error ? <ErrorEstado mensaje={bal.error} reintentar={bal.run} /> : null}
        {bal.datos?.bots ? <PanelBots b={bal.datos.bots} moneda={base} /> : bal.cargando ? <Panel titulo={`Bots de trading en ${base}`}><Esqueleto filas={3} /></Panel> : <Panel titulo={`Bots de trading en ${base}`}><p className="muted">Sin datos de bots ahora.</p></Panel>}
      </div>

      <Panel titulo={`Noticias importantes${moneda ? ` de ${moneda}` : ''} (24 h)`} aside={<Link to="/noticias">Ver todas</Link>} flush>
        {n?.alerta_macro && <div className="panel-b"><Nota tono="warn" titulo="Noticia macro:">{n.alerta_macro}</Nota></div>}
        {n?.evento_riesgo && <div className="panel-b"><Nota tono="loss" titulo="Evento de riesgo:">{n.evento_riesgo}</Nota></div>}
        {n ? <ListaNoticias items={[...n.propias, ...(moneda ? [] : n.macro)].sort((x, y) => (y.fecha ?? 0) - (x.fecha ?? 0)).slice(0, 6)} /> : not.cargando ? <div className="panel-b"><Esqueleto filas={3} /></div> : <p className="panel-b muted">Sin noticias ahora.</p>}
      </Panel>

      {macro.length ? <OroPetroleo activos={macro} /> : null}
      {b && btc.datos && <DetalleBTC b={b} ahora={btc.datos.ahora} />}
    </Pagina>
  );
}
