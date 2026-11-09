import { useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, Bitcoin, BookOpen, CandlestickChart, Crown, FileText, Home, LogOut, MoreHorizontal, Newspaper, PanelLeftClose, PanelLeftOpen, Radar, Settings, Waves, Zap, CheckCircle2,
} from 'lucide-react';
import { diasRestantes, porRenovar, useSesion } from '../lib/sesion';
import { useLocal } from '../lib/usar';
import { fechaCorta, tono, usdt, usdtSigno } from '../lib/formato';

export const RUTAS = [
  { a: '/', t: 'Inicio', i: Home, g: 0 },
  { a: '/senal', t: 'Señal', i: Zap, g: 0 },
  { a: '/posicion', t: 'Posición', i: Activity, g: 0 },
  { a: '/btc', t: 'BTC', i: Bitcoin, g: 1 },
  { a: '/ballenas', t: 'Ballenas', i: Waves, g: 1 },
  { a: '/noticias', t: 'Noticias', i: Newspaper, g: 1 },
  { a: '/escaner', t: 'Escáner', i: Radar, g: 1 },
  { a: '/diario', t: 'Diario', i: BookOpen, g: 2 },
  { a: '/ajustes', t: 'Ajustes', i: Settings, g: 2 },
];
const MOVIL = ['/', '/senal', '/posicion', '/diario'];
const EXTRA: Record<string, string> = { '/terminos': 'Términos y condiciones', '/suscripcion': 'Suscripción' };

function Enlace({ r, punto, onClick, corto }: { r: { a: string; t: string; i: typeof Home }; punto?: boolean; onClick?: () => void; corto?: boolean }) {
  const I = r.i;
  return (
    <NavLink to={r.a} end={r.a === '/'} className="nav-link" onClick={onClick} title={corto ? r.t : undefined} aria-label={corto ? r.t : undefined}>
      <I size={17} aria-hidden /><span className="nav-txt">{r.t}</span>{punto && <span className="dot" aria-label="posición abierta" />}
    </NavLink>
  );
}

export function Shell() {
  const { estado, demo, salir, perfil } = useSesion();
  const loc = useLocation().pathname;
  const [mas, setMas] = useState(false);
  const [plegada, setPlegada] = useLocal('cripto60-nav-plegada', false);
  const [confirmar, setConfirmar] = useState(false);
  useEffect(() => setMas(false), [loc]);
  const actual = RUTAS.find((r) => (r.a === '/' ? loc === '/' : loc.startsWith(r.a)))?.t ?? Object.entries(EXTRA).find(([k]) => loc.startsWith(k))?.[1] ?? '';
  const d = estado?.diario;
  const abierta = !!estado?.posicion_abierta;
  useEffect(() => { document.title = actual ? `${actual} · Cripto60` : 'Cripto60'; }, [actual]);
  const pedirSalir = () => { setMas(false); setConfirmar(true); };
  // ya pagó: la suscripción no se ofrece hasta que falten pocos días
  const hasta = perfil?.suscripcion_hasta ?? null;
  const dias = diasRestantes(hasta);
  const renovar = porRenovar(perfil);

  return (
    <div className={`shell${plegada ? ' plegada' : ''}`}>
      <nav className="nav" aria-label="Principal">
        <div className="nav-head">
          <NavLink to="/" className="brand" title="Cripto60"><span className="brand-mark"><CandlestickChart size={14} aria-hidden /></span><span className="nav-txt">Cripto60</span></NavLink>
          <button type="button" className="nav-toggle" onClick={() => setPlegada(!plegada)} aria-label={plegada ? 'Mostrar el menú' : 'Esconder el menú'} aria-expanded={!plegada} title={plegada ? 'Mostrar el menú' : 'Esconder el menú'}>
            {plegada ? <PanelLeftOpen size={17} aria-hidden /> : <PanelLeftClose size={17} aria-hidden />}
          </button>
        </div>
        <div className="nav-body">
          {[0, 1, 2].map((g) => (
            <div className="nav-group" key={g}>{RUTAS.filter((r) => r.g === g).map((r) => <Enlace key={r.a} r={r} corto={plegada} punto={r.a === '/posicion' && abierta} />)}</div>
          ))}
        </div>
        <div className="nav-foot">
          {!plegada && (
            <div className="nav-cap">
              <div className="lbl">Capital</div>
              <div className="val num">{d ? usdt(d.capital, 2) : '—'}</div>
              <div className="sub num">{d ? <>Hoy <span className={tono(d.hoy.pnl)}>{usdtSigno(d.hoy.pnl)}</span> · {d.hoy.operaciones} op.</> : 'Diario sin iniciar'}</div>
              {hasta && <div className={`sub ${renovar ? 'warn' : 'faint'}`} style={{ marginTop: 6 }}>Suscripción hasta el {fechaCorta(hasta)}</div>}
              {d && <div className="sub" style={{ marginTop: 6 }}>{d.bloqueo ? <span className="warn">Freno activo</span> : <span className="faint"><CheckCircle2 size={12} aria-hidden style={{ verticalAlign: -2 }} /> Sin frenos</span>}</div>}
            </div>
          )}
          <div className="nav-group">
            {renovar && <Enlace r={{ a: '/suscripcion', t: `Renovar (${dias} d)`, i: Crown }} corto={plegada} />}
            <Enlace r={{ a: '/terminos', t: 'Términos y condiciones', i: FileText }} corto={plegada} />
            {!demo && (
              <button type="button" className="nav-link nav-salir" onClick={pedirSalir} title={plegada ? 'Cerrar sesión' : undefined} aria-label={plegada ? 'Cerrar sesión' : undefined}>
                <LogOut size={17} aria-hidden /><span className="nav-txt">Cerrar sesión</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      <div className="main">
        {demo && <div className="demo-band" role="status">Modo demo: datos reales grabados el 7/11/2026 con el motor, y un diario de ejemplo. Conecta Supabase para operar con datos en vivo.</div>}
        <Outlet />
      </div>

      <nav className="tabbar" aria-label="Principal móvil">
        {RUTAS.filter((r) => MOVIL.includes(r.a)).map((r) => {
          const I = r.i;
          return <NavLink key={r.a} to={r.a} end={r.a === '/'} className="tab"><I size={20} aria-hidden />{r.t}</NavLink>;
        })}
        <button className="tab" onClick={() => setMas(true)} aria-haspopup="dialog" aria-current={MOVIL.includes(loc) ? undefined : 'page'}><MoreHorizontal size={20} aria-hidden />Más</button>
      </nav>
      {mas && (
        <>
          <div className="sheet-back" onClick={() => setMas(false)} />
          <div className="sheet" role="dialog" aria-label="Más secciones">
            {RUTAS.filter((r) => !MOVIL.includes(r.a)).map((r) => <Enlace key={r.a} r={r} />)}
            {renovar && <Enlace r={{ a: '/suscripcion', t: `Renovar suscripción (${dias} d)`, i: Crown }} />}
            <Enlace r={{ a: '/terminos', t: 'Términos y condiciones', i: FileText }} />
            {!demo && <button type="button" className="nav-link nav-salir" onClick={pedirSalir}><LogOut size={17} aria-hidden />Cerrar sesión</button>}
          </div>
        </>
      )}
      {confirmar && <ConfirmarSalida onCancelar={() => setConfirmar(false)} onSalir={async () => { setConfirmar(false); await salir(); }} />}
    </div>
  );
}

export function ConfirmarSalida({ onCancelar, onSalir }: { onCancelar: () => void; onSalir: () => Promise<void> }) {
  const [saliendo, setSaliendo] = useState(false);
  const cancelar = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    cancelar.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancelar(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [onCancelar]);
  return (
    <div className="dialog-back" onClick={(e) => e.target === e.currentTarget && onCancelar()}>
      <div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="salir-t" aria-describedby="salir-d">
        <header className="panel-h"><h2 id="salir-t">¿Cerrar sesión?</h2></header>
        <div className="panel-b"><p id="salir-d" className="muted">Tu diario, tus ajustes y la posición que sigues quedan guardados en tu cuenta. Para volver tendrás que entrar con tu correo y contraseña.</p></div>
        <div className="dialog-actions">
          <button ref={cancelar} type="button" className="btn btn-ghost" onClick={onCancelar}>Cancelar</button>
          <button type="button" className="btn btn-primary" disabled={saliendo} onClick={async () => { setSaliendo(true); await onSalir(); }}><LogOut size={16} aria-hidden />{saliendo ? 'Cerrando…' : 'Cerrar sesión'}</button>
        </div>
      </div>
    </div>
  );
}

export function Pagina({ titulo, acciones, children }: { titulo: string; acciones?: ReactNode; children: ReactNode }) {
  return (
    <>
      <header className="topbar"><h1>{titulo}</h1>{acciones && <div className="right">{acciones}</div>}</header>
      <main className="content" id="contenido">{children}</main>
    </>
  );
}
