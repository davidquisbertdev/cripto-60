import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CandlestickChart, Crown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Campo, Nota } from '../components/ui';

// Solo entrar o recuperar la contraseña: las cuentas nuevas se crean al activar una suscripción.
type Modo = 'entrar' | 'recuperar';

export function Acceso() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [clave, setClave] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!/^\S+@\S+\.\S+$/.test(email)) { setErr('Escribe un correo válido.'); return; }
    if (modo === 'entrar' && clave.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return; }
    setErr(null); setOk(null); setEnviando(true);
    const sb = supabase!;
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email, password: clave });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        setOk('Si el correo tiene cuenta, te llegará un enlace para cambiar la contraseña.');
      }
    } catch (x) { setErr((x as Error).message); }
    finally { setEnviando(false); }
  };

  const cambiar = (m: Modo) => { setModo(m); setOk(null); setErr(null); };
  const titulo = modo === 'entrar' ? 'Entrar' : 'Recuperar contraseña';
  return (
    <div className="auth">
      <div className="auth-side">
        <div className="brand" style={{ padding: 0 }}><span className="brand-mark"><CandlestickChart size={14} aria-hidden /></span>Cripto60</div>
        <div>
          <h1>Opera poco, con un plan y con el reloj a la vista.</h1>
          <p className="lede">Señales de 15 a 60 minutos para futuros cripto: LONG, SHORT o NO OPERAR, con entrada, stop loss, TP1 a TP3, apalancamiento y lo que pierdes si sale mal. Solo recomienda lo que ganó de verdad en el historial reciente de esa moneda.</p>
        </div>
        <p className="faint preview" style={{ fontSize: 13 }}>No es asesoría financiera. Las órdenes las pones tú en tu exchange: la app nunca toca tu cuenta.</p>
      </div>
      <div className="auth-form">
        <form className="auth-card" onSubmit={enviar} noValidate>
          <h2>{titulo}</h2>
          {ok ? <Nota tono="gain">{ok}</Nota> : (
            <>
              <Campo etiqueta="Correo"><input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></Campo>
              {modo === 'entrar' && (
                <Campo etiqueta="Contraseña"><input className="input" type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} /></Campo>
              )}
              {err && <Nota tono="warn">{err}</Nota>}
              <button className="btn btn-primary btn-lg" disabled={enviando}>{enviando ? 'Un momento…' : titulo}</button>
            </>
          )}
          <div style={{ display: 'grid', gap: 6, justifyItems: 'start', fontSize: 14 }}>
            {modo === 'entrar'
              ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar('recuperar')}>Olvidé mi contraseña</button>
              : <button type="button" className="btn btn-ghost btn-sm" onClick={() => cambiar('entrar')}>Volver a entrar</button>}
          </div>
          <div className="divider">¿Sin cuenta?</div>
          <Link className="btn btn-block" to="/suscripcion"><Crown size={16} aria-hidden />Ver la suscripción: 100 USDT al mes</Link>
          <p className="faint" style={{ fontSize: 12 }}>Las cuentas se crean al activar la suscripción. Al entrar aceptas los <Link to="/terminos">términos y condiciones</Link>.</p>
        </form>
      </div>
    </div>
  );
}
