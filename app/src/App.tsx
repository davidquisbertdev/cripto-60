import { BrowserRouter, Link, Navigate, Route, Routes } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { ProveedorSesion, useSesion } from './lib/sesion';
import { hayBackend } from './lib/supabase';
import { Shell, Pagina } from './components/Shell';
import { Vacio } from './components/ui';
import { Inicio } from './screens/Inicio';
import { Senal } from './screens/Senal';
import { Posicion } from './screens/Posicion';
import { Btc, Ballenas, Noticias, Escaner } from './screens/Mercado';
import { Diario, Ajustes, Legal } from './screens/Cuenta';
import { Acceso } from './screens/Acceso';

function Rutas() {
  const { listo, sesion, toast } = useSesion();
  if (!listo) return null;
  const dentro = !hayBackend || !!sesion;
  return (
    <>
      <Routes>
        {!dentro ? (
          <>
            <Route path="/terminos" element={<div className="main"><Legal /></div>} />
            <Route path="/legal" element={<Navigate to="/terminos" replace />} />
            <Route path="*" element={<Acceso />} />
          </>
        ) : (
          <Route element={<Shell />}>
            <Route index element={<Inicio />} />
            <Route path="senal" element={<Senal />} />
            <Route path="posicion" element={<Posicion />} />
            <Route path="btc" element={<Btc />} />
            <Route path="ballenas" element={<Ballenas />} />
            <Route path="noticias" element={<Noticias />} />
            <Route path="escaner" element={<Escaner />} />
            <Route path="diario" element={<Diario />} />
            <Route path="ajustes" element={<Ajustes />} />
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
