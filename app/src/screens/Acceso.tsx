import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CandlestickChart } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Campo, Nota } from '../components/ui';

type Modo = 'entrar' | 'crear' | 'recuperar';

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
    if (modo !== 'recuperar' && clave.length < 8) { setErr('La contraseña debe tener al menos 8 caracteres.'); return; }
    setErr(null); setOk(null); setEnviando(true);
    const sb = supabase!;
    try {
      if (modo === 'entrar') {
        const { error } = await sb.auth.signInWithPassword({ email, password: clave });
        if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos.' : error.message);
      } else if (modo === 'crear') {
        const { error } = await sb.auth.signUp({ email, password: clave, options: { emailRedirectTo: location.origin } });
        if (error) throw error;
        setOk('Te enviamos un correo para confirmar la cuenta. Ábrelo y vuelve aquí para entrar.');
      } else {
        const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
        if (error) throw error;
        setOk('Si el correo tiene cuenta, te llegará un enlace para cambiar la contraseña.');
      }
    } catch (x) { setErr((x as Error).message); }
    finally { setEnviando(false); }
  };

  const titulo = { entrar: 'Entrar', crear: 'Crear cuenta', recuperar: 'Recuperar contraseña' }[modo];
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
              {modo !== 'recuperar' && (
                <Campo etiqueta="Contraseña" hint={modo === 'crear' ? 'Al menos 8 caracteres.' : undefined}>
                  <input className="input" type="password" autoComplete={modo === 'crear' ? 'new-password' : 'current-password'} value={clave} onChange={(e) => setClave(e.target.value)} />
                </Campo>
              )}
              {err && <Nota tono="warn">{err}</Nota>}
              <button className="btn btn-primary btn-lg" disabled={enviando}>{enviando ? 'Un momento…' : titulo}</button>
            </>
          )}
          <div className="divider">o</div>
          <div style={{ display: 'grid', gap: 6, justifyItems: 'start', fontSize: 14 }}>
            {modo !== 'entrar' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModo('entrar'); setOk(null); setErr(null); }}>Ya tengo cuenta: entrar</button>}
            {modo !== 'crear' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModo('crear'); setOk(null); setErr(null); }}>Crear una cuenta nueva</button>}
            {modo === 'entrar' && <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setModo('recuperar'); setOk(null); setErr(null); }}>Olvidé mi contraseña</button>}
          </div>
          <p className="faint" style={{ fontSize: 12 }}>Al entrar aceptas los <Link to="/terminos">términos y condiciones</Link>.</p>
        </form>
      </div>
    </div>
  );
}
