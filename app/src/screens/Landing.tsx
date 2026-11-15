// Página pública de presentación (ruta «/» sin sesión): qué hace Cripto60, el demo sin cuenta y la membresía
// de 100 USDT al mes. No promete ganancias ni inventa resultados (ver PRODUCT.md): el ejemplo de señal es una
// salida real del motor grabada, la misma del demo.
import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity, ArrowRight, Bitcoin, BookOpen, CalendarClock, CandlestickChart, Check, Clock, Gauge, KeyRound, Newspaper, PlayCircle, Radar, ShieldCheck, Target, TrendingUp, Waves, Zap,
} from 'lucide-react';
import { LadoTag, NivelTag } from '../components/ui';
import { entrarDemo } from '../lib/modoDemo';
import { fechaCorta, numero, precio as fp, usdtSigno } from '../lib/formato';
import { PRECIO, PREGUNTAS } from './Suscripcion';
import type { Lado, Nivel, Plan } from '../lib/tipos';
import demoDatos from '../demo/datos.json';

const SITIO = (import.meta.env.VITE_SITIO_URL?.trim() || location.origin).replace(/\/$/, '');
const TITULO = 'Cripto60 · Señales de futuros cripto de 15 a 60 minutos';
const CONTACTO_URL = import.meta.env.VITE_CONTACTO_URL?.trim() || '';

const PRINCIPIOS = [
  { i: ShieldCheck, t: 'El historial real manda', d: 'Antes de recomendar, mide la misma señal en las últimas ~28 horas de esa moneda, con comisiones. Si pierde en promedio, la respuesta es NO OPERAR.' },
  { i: Gauge, t: 'El riesgo antes que la ganancia', d: 'Cada plan dice cuánto pierdes si salta el stop, con el mismo peso que lo que puedes ganar. El apalancamiento sale de ese límite, no al revés.' },
  { i: Clock, t: 'El tiempo es parte de la orden', d: 'Cuándo caduca la entrada, cuándo cerrar si no llega el TP1 y la hora del cierre total. Una operación corta que se alarga deja de ser la misma operación.' },
];

const GRUPOS = [
  { t: 'Para operar', d: 'Lo que abres cuando vas a entrar.', f: [
    { i: Zap, t: 'Señal de 15 a 60 minutos', d: 'LONG, SHORT o NO OPERAR para cualquier perpetuo USDT, con entrada, stop loss, TP1 a TP3, apalancamiento, margen y la MEJOR ENTRADA: a mercado o con una limit mejor.' },
    { i: Activity, t: 'Revisión de la posición', d: 'MANTENER, MOVER SL, REDUCIR o CERRAR según lo que hizo el precio, el tiempo transcurrido, Bitcoin, las ballenas y las noticias desde que entraste.' },
    { i: TrendingUp, t: 'Swing de días a semanas', d: 'Velas diarias y solo los setups que ganaron en el historial de 2 años de esa moneda. Guarda tus entradas y te dice cuándo mover el stop.' },
    { i: Target, t: 'Predicción de MEXC', d: 'Las cajas Up/Down de 5 y 15 minutos de BTC y ETH con su reloj, la probabilidad de cada lado y hasta qué precio vale la pena entrar.' },
  ] },
  { t: 'Para leer el mercado', d: 'El contexto que cambia una señal.', f: [
    { i: Bitcoin, t: 'Bitcoin siempre de guía', d: 'Lectura de BTC en 1m, 5m, 15m y 1h, cuánto arrastra a tu altcoin y bloqueo de las jugadas que van contra él.' },
    { i: Waves, t: 'Ballenas y bots', d: 'Posiciones reales de las billeteras más grandes de Hyperliquid, top traders frente a minoristas, open interest, flujo, muros del libro y la huella de los bots.' },
    { i: Newspaper, t: 'Noticias y calendario', d: 'Titulares por moneda, alertas de hacks y deslistados, Fear & Greed, el calendario económico (IPC, empleo, Fed) y las aperturas de bolsa con aviso.' },
    { i: Radar, t: 'Escáner de monedas', d: 'Las monedas con más volumen ordenadas por las que se mueven lo bastante frente a sus comisiones, confirmadas con la señal completa.' },
  ] },
  { t: 'Para cuidar el capital', d: 'Los frenos que no dependen de tu ánimo.', f: [
    { i: Gauge, t: 'Apalancamiento calculado', d: 'Sale de tu objetivo en USDT y lo frenan tu pérdida máxima y la distancia a la liquidación. Tú eliges el tope, de 30x a 500x.' },
    { i: BookOpen, t: 'Diario con frenos', d: 'Capital, acierto y resultado del día. Con 2 pérdidas seguidas, pausa de 30 minutos; al llegar a tu pérdida máxima diaria, se para hasta mañana.' },
    { i: KeyRound, t: 'Sin API keys', d: 'Cripto60 solo lee datos públicos de Binance, Bybit y MEXC. Las órdenes las pones tú a mano: la app nunca toca tu cuenta.' },
  ] },
];

const PASOS = [
  { t: 'Pide la señal', d: 'Eliges la moneda, tu capital y cuánto quieres ganar en USDT. En segundos tienes LONG, SHORT o NO OPERAR con todo el plan.' },
  { t: 'Pon la orden a mano', d: 'Copias entrada, stop y TPs en tu exchange. Si la respuesta fue NO OPERAR, no hay orden: buscas otra moneda con el escáner.' },
  { t: 'Sigue el reloj', d: 'La app sigue tu posición y te dice qué hacer. Al cerrar, anotas el resultado y el diario decide si puedes seguir.' },
];

const EXTRA = [
  { p: '¿Qué puedo ver en el demo?', r: 'La app completa con análisis reales grabados con el motor y un diario de ejemplo. No pide cuenta ni correo. Los datos no son en vivo: para eso hace falta la membresía.' },
  { p: '¿Con qué exchanges funciona?', r: 'Los datos salen de Binance (por defecto), Bybit o MEXC, y operas en el exchange que uses: la app te da los niveles y tú pones la orden.' },
];
const FAQ = [...EXTRA, ...PREGUNTAS];

// Ejemplo real grabado con el motor (el mismo del demo)
const S = demoDatos.senal as unknown as { base: string; recomendacion: Lado | 'NO OPERAR'; nivel: Nivel; decimales: number; creada: number; plan: Plan; duracion_max_min: number };

function EjemploSenal() {
  const p = S.plan, d = S.decimales;
  return (
    <figure className="lp-ejemplo panel">
      <header className="panel-h"><h2>{S.base}/USDT · señal</h2><div className="aside"><LadoTag lado={S.recomendacion} /><NivelTag nivel={S.nivel} /></div></header>
      <div className="lp-niveles num">
        <div><span>Entrada</span><strong>{fp(p.entrada, d)}</strong></div>
        <div><span>Stop loss</span><strong className="loss">{fp(p.sl, d)}</strong></div>
        {p.tps.map((t) => <div key={t.n}><span>TP{t.n} · cierra {t.cerrar_pct} %</span><strong className="gain">{fp(t.precio, d)}</strong></div>)}
      </div>
      <div className="lp-cara num">
        <div><span>Si salta el SL</span><strong className="loss">{usdtSigno(p.escenarios.sl_directo, 2)}</strong></div>
        <div><span>Con todos los TP</span><strong className="gain">{usdtSigno(p.escenarios.todos_los_tps, 2)}</strong></div>
        <div><span>Apalancamiento</span><strong>{p.apalancamiento}x</strong></div>
        <div><span>Cierre total</span><strong>{S.duracion_max_min} min</strong></div>
      </div>
      <figcaption className="faint">Ejemplo real grabado con el motor el {fechaCorta(S.creada)}, con {numero(p.margen_pct_capital > 0 ? (100 * p.margen) / p.margen_pct_capital : 10, 0)} USDT de capital. No es una recomendación ni un resultado.</figcaption>
    </figure>
  );
}

// Título, descripción y datos estructurados de esta página (el resto de la app no se indexa)
function useSeo() {
  useEffect(() => {
    const antes = document.title;
    document.title = TITULO;
    const ld = document.createElement('script');
    ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org', '@type': 'FAQPage', url: `${SITIO}/`,
      mainEntity: FAQ.map((x) => ({ '@type': 'Question', name: x.p, acceptedAnswer: { '@type': 'Answer', text: x.r } })),
    });
    document.head.appendChild(ld);
    return () => { document.title = antes; ld.remove(); };
  }, []);
}

export function Landing() {
  useSeo();
  return (
    <div className="lp">
      <header className="sus-top lp-top">
        <Link to="/" className="brand"><span className="brand-mark"><CandlestickChart size={14} aria-hidden /></span>Cripto60</Link>
        <nav className="lp-nav" aria-label="Secciones">
          <a href="#funciones">Funciones</a><a href="#como">Cómo funciona</a><a href="#precio">Precio</a><a href="#preguntas">Preguntas</a>
        </nav>
        <div className="right">
          <button type="button" className="btn btn-sm" onClick={entrarDemo}><PlayCircle size={14} aria-hidden />Ver demo</button>
          <Link className="btn btn-sm btn-primary" to="/entrar">Entrar</Link>
        </div>
      </header>

      <main id="contenido">
        <section className="lp-hero lp-ancho">
          <div className="lp-hero-txt">
            <span className="tag tag-accent">Futuros cripto · operativa manual</span>
            <h1>Señales de futuros cripto de 15 a 60 minutos, con plan, reloj y el valor de decir NO OPERAR.</h1>
            <p className="lp-lede">Para quien opera perpetuos a mano con capital pequeño. Cripto60 te da entrada, stop loss, TP1 a TP3, apalancamiento y la hora de salida antes de entrar, y solo recomienda lo que ganó de verdad en el historial reciente de esa moneda.</p>
            <div className="lp-cta">
              <button type="button" className="btn btn-primary btn-lg" onClick={entrarDemo}><PlayCircle size={18} aria-hidden />Probar el demo, sin cuenta</button>
              <Link className="btn btn-lg" to="/suscripcion">Membresía · {PRECIO} USDT al mes<ArrowRight size={16} aria-hidden /></Link>
            </div>
            <ul className="lp-sellos">
              <li><Check size={14} aria-hidden />Sin API keys</li>
              <li><Check size={14} aria-hidden />Datos de Binance, Bybit y MEXC</li>
              <li><Check size={14} aria-hidden />Sin cobro automático</li>
            </ul>
          </div>
          <EjemploSenal />
        </section>

        <section className="lp-banda" aria-label="Principios">
          <div className="lp-ancho lp-principios">
            {PRINCIPIOS.map(({ i: I, t, d }) => <div key={t}><span className="sus-ico"><I size={18} aria-hidden /></span><h2>{t}</h2><p className="muted">{d}</p></div>)}
          </div>
        </section>

        <section id="funciones" className="lp-ancho lp-sec" aria-labelledby="lp-f">
          <h2 id="lp-f" className="lp-h">Todo lo que incluye la membresía</h2>
          <p className="lp-sub muted">Un solo motor para la señal, la posición, el mercado y tu diario. Sin planes ni funciones de pago aparte.</p>
          {GRUPOS.map((g) => (
            <div className="lp-grupo" key={g.t}>
              <div className="lp-grupo-h"><h3>{g.t}</h3><span className="faint">{g.d}</span></div>
              <div className="sus-grid">
                {g.f.map(({ i: I, t, d }) => (
                  <article className="panel sus-f" key={t}><div className="panel-b"><span className="sus-ico"><I size={18} aria-hidden /></span><h4>{t}</h4><p className="muted">{d}</p></div></article>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section id="como" className="lp-banda" aria-labelledby="lp-c">
          <div className="lp-ancho lp-sec">
            <h2 id="lp-c" className="lp-h">Cómo funciona</h2>
            <ol className="lp-pasos">
              {PASOS.map((p, n) => <li key={p.t}><span className="sus-n num">{n + 1}</span><div><h3>{p.t}</h3><p className="muted">{p.d}</p></div></li>)}
            </ol>
            <div className="lp-demo panel">
              <div className="panel-b">
                <div><h3>Míralo todo antes de pagar</h3><p className="muted">El demo abre la app completa con análisis reales grabados y un diario de ejemplo. No pide cuenta ni correo.</p></div>
                <button type="button" className="btn btn-primary btn-lg" onClick={entrarDemo}><PlayCircle size={18} aria-hidden />Abrir el demo</button>
              </div>
            </div>
          </div>
        </section>

        <section id="precio" className="lp-ancho lp-sec lp-precio" aria-labelledby="lp-p">
          <div>
            <h2 id="lp-p" className="lp-h">Una membresía, todo incluido</h2>
            <p className="lp-sub muted">Pagas {PRECIO} USDT por Binance Pay y tu cuenta queda activa 30 días. No hay cobro automático: renuevas tú cuando quieras, y en Ajustes ves cuántos días te quedan.</p>
            <ul className="sus-incluye lp-incluye">
              <li><Check size={15} aria-hidden />Señales, revisión de posición, swing y predicción, sin límite de uso</li>
              <li><Check size={15} aria-hidden />Mercado, ballenas, noticias, calendario y escáner</li>
              <li><Check size={15} aria-hidden />Tu diario y tus ajustes guardados en tu cuenta, aunque no renueves</li>
            </ul>
          </div>
          <div className="sus-precio panel">
            <div className="panel-b">
              <div className="sus-monto num">{PRECIO}<span> USDT</span></div>
              <div className="muted"><CalendarClock size={14} aria-hidden style={{ verticalAlign: -2 }} /> al mes · 30 días por pago</div>
              <Link className="btn btn-primary btn-lg btn-block" to="/suscripcion"><CandlestickChart size={16} aria-hidden />Quiero la membresía</Link>
              <button type="button" className="btn btn-block" onClick={entrarDemo}><PlayCircle size={16} aria-hidden />Primero el demo</button>
              <p className="faint" style={{ fontSize: 13, textAlign: 'center' }}>¿Ya tienes cuenta? <Link to="/entrar">Entrar</Link></p>
            </div>
          </div>
        </section>

        <section id="preguntas" className="lp-ancho lp-sec" aria-labelledby="lp-q">
          <h2 id="lp-q" className="lp-h">Preguntas</h2>
          <div className="panel">{FAQ.map((x) => <details className="sus-q" key={x.p}><summary>{x.p}</summary><p className="muted">{x.r}</p></details>)}</div>
        </section>
      </main>

      <footer className="lp-pie">
        <div className="lp-ancho">
          <p className="faint">Cripto60 es un software de análisis, no asesoría financiera. La confianza de una señal no es una probabilidad, un stop no es una garantía y los futuros apalancados pueden liquidar tu posición. Opera solo con dinero que puedas perder.</p>
          <nav aria-label="Enlaces">
            <Link to="/terminos">Términos y condiciones</Link><Link to="/suscripcion">Membresía</Link><Link to="/entrar">Entrar</Link>
            {CONTACTO_URL && <a href={CONTACTO_URL} target="_blank" rel="noreferrer">Contacto</a>}
          </nav>
        </div>
      </footer>
    </div>
  );
}
