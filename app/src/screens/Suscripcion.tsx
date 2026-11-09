// Suscripción: 100 USDT al mes, pagados por Binance Pay. Sin cobro automático: el pago se confirma a
// mano y la cuenta se crea o renueva por 30 días. No promete ganancias (ver PRODUCT.md).
import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, Bitcoin, BookOpen, CalendarClock, CandlestickChart, Check, Clipboard, Clock, Gauge, LogOut, Newspaper, Radar, ShieldCheck, Waves, Zap,
} from 'lucide-react';
import { ConfirmarSalida, Pagina } from '../components/Shell';
import { Nota } from '../components/ui';
import { useSesion } from '../lib/sesion';
import { fechaHora } from '../lib/formato';

const PRECIO = 100;
const PAY_ID = import.meta.env.VITE_BINANCE_PAY_ID?.trim() || '';
const CONTACTO_URL = import.meta.env.VITE_CONTACTO_URL?.trim() || '';
const CONTACTO_TEXTO = import.meta.env.VITE_CONTACTO_TEXTO?.trim() || CONTACTO_URL;

const FUNCIONES = [
  { i: Zap, t: 'Señal en segundos', d: 'LONG, SHORT o NO OPERAR para cualquier perpetuo USDT, con entrada limit o a mercado, stop loss, TP1 a TP3 y cuánto cierra cada uno.' },
  { i: ShieldCheck, t: 'El historial real manda', d: 'Antes de recomendar, mide la misma señal en las últimas ~28 h de esa moneda con comisiones. Si pierde en promedio, dice NO OPERAR.' },
  { i: Gauge, t: 'Apalancamiento calculado', d: 'Sale de tu objetivo en USDT y lo frenan tu pérdida máxima y la distancia a la liquidación. Tú eliges el tope: de 30x a 500x.' },
  { i: Clock, t: 'El reloj de cada operación', d: 'Cuándo caduca la entrada, cuándo cerrar si no llega el TP1 y la hora del cierre total. Duración por defecto o por operación (60, 120 min…).' },
  { i: Activity, t: 'Revisión de la posición', d: 'MANTENER, MOVER SL, REDUCIR o CERRAR según lo que hizo el precio, el tiempo, BTC, las ballenas y las noticias desde que entraste.' },
  { i: Bitcoin, t: 'BTC siempre de guía', d: 'Lectura de Bitcoin en 1m, 5m, 15m y 1h, cuánto arrastra a tu altcoin y bloqueo de las jugadas que van contra él.' },
  { i: Waves, t: 'Ballenas y dinero grande', d: 'Posiciones reales de las billeteras más grandes de Hyperliquid, top traders frente a minoristas, open interest, flujo y muros del libro.' },
  { i: Radar, t: 'Escáner de monedas', d: 'Las monedas con más volumen ordenadas por las que se mueven lo bastante frente a sus comisiones para una operación corta.' },
  { i: Newspaper, t: 'Noticias y sentimiento', d: 'Titulares por moneda, alertas de hacks y deslistados, y el índice Fear & Greed.' },
  { i: BookOpen, t: 'Diario con frenos', d: 'Capital, acierto y resultado del día. Pausa tras pérdidas seguidas y parada al llegar a tu pérdida máxima diaria.' },
];

const PASOS = [
  <>Abre <strong>Binance</strong> → <strong>Pay</strong> → <strong>Enviar</strong>.</>,
  <>Envía <strong>{PRECIO} USDT</strong> al Binance Pay ID de abajo. En la nota pon el <strong>correo</strong> con el que quieres entrar.</>,
  <>Manda la captura del pago {CONTACTO_URL ? <>por <a href={CONTACTO_URL} target="_blank" rel="noreferrer">{CONTACTO_TEXTO}</a></> : 'por el contacto de abajo'}.</>,
  <>Te creamos la cuenta (o la renovamos) por <strong>30 días</strong> y te llega el acceso a ese correo.</>,
];

const PREGUNTAS = [
  { p: '¿Se cobra solo cada mes?', r: 'No. Binance Pay no hace cobros automáticos: pagas tú cada mes y la cuenta se renueva 30 días desde la fecha en que vencía.' },
  { p: '¿Necesita mis API keys o mi cuenta del exchange?', r: 'No. Cripto60 solo lee datos públicos. Las órdenes las pones tú a mano en tu exchange.' },
  { p: '¿Garantiza ganancias?', r: 'No. Es un software de análisis, no asesoría financiera. Muchas veces la respuesta es NO OPERAR, y los futuros apalancados pueden liquidarte.' },
  { p: '¿Qué pasa si no renuevo?', r: 'Tu cuenta, tu diario y tus ajustes se guardan; el motor se desactiva hasta que vuelvas a pagar.' },
];

function Copiar({ texto }: { texto: string }) {
  const [hecho, setHecho] = useState(false);
  return (
    <button type="button" className="btn btn-sm" onClick={async () => { try { await navigator.clipboard.writeText(texto); setHecho(true); setTimeout(() => setHecho(false), 1800); } catch { /* sin portapapeles */ } }}>
      {hecho ? <Check size={14} aria-hidden /> : <Clipboard size={14} aria-hidden />}{hecho ? 'Copiado' : 'Copiar'}
    </button>
  );
}

function Contenido() {
  const { perfil, suscrita, sesion, demo } = useSesion();
  const dentro = !!sesion || demo;
  return (
    <div className="sus">
      {sesion && suscrita === false && (
        <Nota tono="warn" titulo="Tu suscripción no está activa.">
          {perfil?.suscripcion_hasta ? `Venció el ${fechaHora(perfil.suscripcion_hasta)}. ` : ''}Tu diario y tus ajustes siguen guardados: renueva para volver a usar el motor.
        </Nota>
      )}
      {sesion && suscrita && perfil?.suscripcion_hasta && (
        <Nota tono="gain" titulo="Suscripción activa.">Hasta el {fechaHora(perfil.suscripcion_hasta)}. Para renovar antes, sigue los mismos pasos: se suman 30 días a esa fecha.</Nota>
      )}

      <section className="sus-hero">
        <div className="sus-hero-txt">
          <span className="tag tag-accent">Cripto60 · plan mensual</span>
          <h2>Un plan para cada operación de 15 a 60 minutos, y el valor de decir NO OPERAR.</h2>
          <p className="muted">Para quien opera futuros cripto a mano con capital pequeño y quiere entrada, stop, TPs, apalancamiento y la hora de salida antes de entrar, no después.</p>
        </div>
        <div className="sus-precio panel">
          <div className="panel-b">
            <div className="sus-monto num">{PRECIO}<span> USDT</span></div>
            <div className="muted">al mes · pago con Binance Pay</div>
            <ul className="sus-incluye">
              <li><Check size={15} aria-hidden />Todas las funciones, sin límite de señales</li>
              <li><Check size={15} aria-hidden />Una cuenta con tu diario y tus ajustes</li>
              <li><Check size={15} aria-hidden />Sin renovación automática</li>
            </ul>
            <a className="btn btn-primary btn-lg btn-block" href="#pagar"><CandlestickChart size={16} aria-hidden />Suscribirme</a>
            {!dentro && <p className="faint" style={{ fontSize: 13, textAlign: 'center' }}>¿Ya tienes cuenta? <Link to="/">Entrar</Link></p>}
          </div>
        </div>
      </section>

      <section aria-labelledby="sus-f">
        <h2 id="sus-f" className="sus-h">Qué incluye</h2>
        <div className="sus-grid">
          {FUNCIONES.map(({ i: I, t, d }) => (
            <div className="panel sus-f" key={t}>
              <div className="panel-b"><span className="sus-ico"><I size={18} aria-hidden /></span><h3>{t}</h3><p className="muted">{d}</p></div>
            </div>
          ))}
        </div>
      </section>

      <section id="pagar" className="panel" aria-labelledby="sus-p">
        <header className="panel-h"><h2 id="sus-p">Cómo pagar con Binance</h2><div className="aside"><CalendarClock size={14} aria-hidden />30 días por pago</div></header>
        <div className="panel-b sus-pago">
          <ol className="sus-pasos">{PASOS.map((p, n) => <li key={n}><span className="sus-n num">{n + 1}</span><span>{p}</span></li>)}</ol>
          <div className="sus-datos">
            <div className="rows">
              <div className="row"><span className="k">Importe</span><span className="v num">{PRECIO} USDT</span></div>
              <div className="row"><span className="k">Método</span><span className="v">Binance Pay</span></div>
              <div className="row">
                <span className="k">Binance Pay ID</span>
                <span className="v num" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{PAY_ID || '—'}{PAY_ID && <Copiar texto={PAY_ID} />}</span>
              </div>
              <div className="row">
                <span className="k">Comprobante</span>
                <span className="v">{CONTACTO_URL ? <a href={CONTACTO_URL} target="_blank" rel="noreferrer">{CONTACTO_TEXTO}</a> : '—'}</span>
              </div>
            </div>
            {(!PAY_ID || !CONTACTO_URL) && <Nota tono="warn">Faltan los datos de pago. Configura VITE_BINANCE_PAY_ID y VITE_CONTACTO_URL en app/.env.local.</Nota>}
            <p className="faint" style={{ fontSize: 13 }}>Envía solo USDT por Binance Pay (sin comisión entre cuentas de Binance). Revisa el Pay ID antes de confirmar: un pago a otro ID no se puede recuperar.</p>
          </div>
        </div>
      </section>

      <section aria-labelledby="sus-q">
        <h2 id="sus-q" className="sus-h">Preguntas</h2>
        <div className="panel">{PREGUNTAS.map((x) => <details className="sus-q" key={x.p}><summary>{x.p}</summary><p className="muted">{x.r}</p></details>)}</div>
      </section>

      <p className="faint" style={{ fontSize: 13 }}>No es asesoría financiera. Lee los <Link to="/terminos">términos y condiciones</Link> antes de pagar.</p>
    </div>
  );
}

// Dentro de la app (con menú)
export function Suscripcion() {
  return <Pagina titulo="Suscripción"><Contenido /></Pagina>;
}

// Fuera de la app: sin sesión, o con la suscripción vencida
export function SuscripcionPublica() {
  const { sesion, salir } = useSesion();
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="sus-pub">
      <header className="sus-top">
        <Link to="/" className="brand"><span className="brand-mark"><CandlestickChart size={14} aria-hidden /></span>Cripto60</Link>
        <div className="right">
          {sesion
            ? <button type="button" className="btn btn-sm btn-ghost" onClick={() => setConfirmar(true)}><LogOut size={14} aria-hidden />Cerrar sesión</button>
            : <Link className="btn btn-sm" to="/">Entrar</Link>}
        </div>
      </header>
      <main className="content sus-main" id="contenido"><h1 className="sr-only">Suscripción a Cripto60</h1><Contenido /></main>
      {confirmar && <ConfirmarSalida onCancelar={() => setConfirmar(false)} onSalir={async () => { setConfirmar(false); await salir(); }} />}
    </div>
  );
}
