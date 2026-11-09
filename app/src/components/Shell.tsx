import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity, Bitcoin, BookOpen, CandlestickChart, FileText, Home, LogOut, MoreHorizontal, Newspaper, Radar, Settings, Waves, Zap, CheckCircle2,
} from 'lucide-react';
import { useSesion } from '../lib/sesion';
import { tono, usdt, usdtSigno } from '../lib/formato';

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

function Enlace({ r, punto, onClick }: { r: (typeof RUTAS)[number]; punto?: boolean; onClick?: () => void }) {
  const I = r.i;
  return (
    <NavLink to={r.a} end={r.a === '/'} className="nav-link" onClick={onClick}>
      <I size={17} aria-hidden />{r.t}{punto && <span className="dot" aria-label="posición abierta" />}
    </NavLink>
  );
}

export function Shell() {
  const { estado, demo, salir } = useSesion();
  const loc = useLocation();
  const [mas, setMas] = useState(false);
  useEffect(() => setMas(false), [loc.pathname]);
  const actual = RUTAS.find((r) => (r.a === '/' ? loc.pathname === '/' : loc.pathname.startsWith(r.a))) ?? (loc.pathname.startsWith('/legal') ? { t: 'Letra pequeña' } : { t: '' });
  const d = estado?.diario;
  const abierta = !!estado?.posicion_abierta;
  useEffect(() => { document.title = actual.t ? `${actual.t} · Cripto60` : 'Cripto60'; }, [actual.t]);

  return (
    <div className="shell">
      <nav className="nav" aria-label="Principal">
        <NavLink to="/" className="brand"><span className="brand-mark"><CandlestickChart size={14} aria-hidden /></span>Cripto60</NavLink>
        {[0, 1, 2].map((g) => (
          <div className="nav-group" key={g}>{RUTAS.filter((r) => r.g === g).map((r) => <Enlace key={r.a} r={r} punto={r.a === '/posicion' && abierta} />)}</div>
        ))}
        <div className="nav-foot">
          <div className="nav-cap">
            <div className="lbl">Capital</div>
            <div className="val num">{d ? usdt(d.capital, 2) : '—'}</div>
            <div className="sub num">{d ? <>Hoy <span className={tono(d.hoy.pnl)}>{usdtSigno(d.hoy.pnl)}</span> · {d.hoy.operaciones} op.</> : 'Diario sin iniciar'}</div>
            {d && <div className="sub" style={{ marginTop: 6 }}>{d.bloqueo ? <span className="warn">Freno activo</span> : <span className="faint"><CheckCircle2 size={12} aria-hidden style={{ verticalAlign: -2 }} /> Sin frenos</span>}</div>}
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <NavLink to="/legal" className="nav-link" style={{ flex: 1 }}><FileText size={16} aria-hidden />Letra pequeña</NavLink>
            {!demo && <button className="btn btn-ghost icon-btn" onClick={salir} aria-label="Cerrar sesión" title="Cerrar sesión"><LogOut size={16} /></button>}
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
        <button className="tab" onClick={() => setMas(true)} aria-haspopup="dialog" aria-current={MOVIL.includes(loc.pathname) ? undefined : 'page'}><MoreHorizontal size={20} aria-hidden />Más</button>
      </nav>
      {mas && (
        <>
          <div className="sheet-back" onClick={() => setMas(false)} />
          <div className="sheet" role="dialog" aria-label="Más secciones">
            {RUTAS.filter((r) => !MOVIL.includes(r.a)).map((r) => <Enlace key={r.a} r={r} />)}
            <NavLink to="/legal" className="nav-link"><FileText size={17} aria-hidden />Letra pequeña</NavLink>
            {!demo && <button className="nav-link" style={{ border: 0, background: 'none', width: '100%', cursor: 'pointer' }} onClick={salir}><LogOut size={17} aria-hidden />Cerrar sesión</button>}
          </div>
        </>
      )}
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
