import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { ProveedorSesion, porRenovar, useSesion } from './lib/sesion';
import { hayBackend } from './lib/supabase';
import { Shell, Pagina } from './components/Shell';
import { ErrorEstado, Vacio } from './components/ui';
import { Inicio } from './screens/Inicio';
import { Senal } from './screens/Senal';
import { Posicion } from './screens/Posicion';
import { Ballenas, Noticias, Escaner } from './screens/Mercado';
import { Panorama } from './screens/Panorama';
import { Swing } from './screens/Swing';
import { Prediccion } from './screens/Prediccion';
import { Diario, Ajustes, Legal } from './screens/Cuenta';
import { Acceso } from './screens/Acceso';
import { Suscripcion, SuscripcionPublica } from './screens/Suscripcion';

function Rutas() {
  const { listo, sesion, suscrita, errorPerfil, refrescar, salir, toast, perfil } = useSesion();
  // ya pagó: la página de venta solo vuelve cuando toca renovar
  const renovar = porRenovar(perfil);
  if (!listo) return null;
  const dentro = !hayBackend || !!sesion;
  if (dentro && errorPerfil && suscrita === null) {
    return (
      <div className="main"><Pagina titulo="Cripto60"><ErrorEstado mensaje={errorPerfil} reintentar={refrescar} /><div><button className="btn btn-ghost" onClick={salir}>Cerrar sesión</button></div></Pagina></div>
    );
  }
  // con sesión, se espera al perfil para saber si la suscripción está al día
  if (dentro && suscrita === null) return null;
  return (
    <>
      <Routes>
        {!dentro ? (
          <>
            <Route path="/terminos" element={<div className="main"><Legal /></div>} />
            <Route path="/legal" element={<Navigate to="/terminos" replace />} />
            <Route path="/suscripcion" element={<SuscripcionPublica />} />
            <Route path="*" element={<Acceso />} />
          </>
        ) : !suscrita ? (
          // sesión iniciada pero sin suscripción activa: solo la página para renovar y los términos
          <>
            <Route path="/terminos" element={<div className="main"><Legal /></div>} />
            <Route path="*" element={<SuscripcionPublica />} />
          </>
        ) : (
          <Route element={<Shell />}>
            <Route index element={<Inicio />} />
            <Route path="senal" element={<Senal />} />
            <Route path="posicion" element={<Posicion />} />
            <Route path="mercado" element={<Panorama />} />
            <Route path="swing" element={<Swing />} />
            <Route path="prediccion" element={<Prediccion />} />
            <Route path="btc" element={<Navigate to="/mercado" replace />} />
            <Route path="ballenas" element={<Ballenas />} />
            <Route path="noticias" element={<Noticias />} />
            <Route path="escaner" element={<Escaner />} />
            <Route path="diario" element={<Diario />} />
            <Route path="ajustes" element={<Ajustes />} />
            <Route path="suscripcion" element={renovar ? <Suscripcion /> : <Navigate to="/" replace />} />
            <Route path="terminos" element={<Legal />} />
            <Route path="legal" element={<Navigate to="/terminos" replace />} />
            <Route path="*" element={<Pagina titulo="No encontrado"><div className="panel"><Vacio icono={<Compass size={28} aria-hidden />} titulo="Esta página no existe" accion={<Link className="btn" to="/">Ir al inicio</Link>} /></div></Pagina>} />
          </Route>
        )}
      </Routes>
      {toast && <div className="toast" role="status">{toast}</div>}
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <ProveedorSesion><Rutas /></ProveedorSesion>
    </BrowserRouter>
  );
}
