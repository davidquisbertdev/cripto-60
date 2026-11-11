// Aperturas de mercado de hoy: cuenta atrás, cuánto suelen mover y el interruptor de alertas.
// No son señales: son ventanas de riesgo (golpe fuerte de pocos minutos hacia cualquier lado).
import { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing } from 'lucide-react';
import { Panel } from './ui';
import { agenda } from '../../../lib/aperturas.mjs';
import { useAhora } from '../lib/usar';
import { hora, fechaHora } from '../lib/formato';
import { avisosPendientes, guardarModo, leerModo, pedirPermiso, permisoNotificaciones, prepararSonido, sonar, type ModoAlertas } from '../lib/alertas';
import { useSesion } from '../lib/sesion';

const cuentaAtras = (ms: number) => {
  if (ms <= 0) return 'ahora';
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), x = s % 60;
  return h ? `${h} h ${String(m).padStart(2, '0')} min` : m >= 10 ? `${m} min` : `${m}:${String(x).padStart(2, '0')}`;
};
const hoy = (t: number, ahora: number) => new Date(t).toDateString() === new Date(ahora).toDateString();

export function useModoAlertas() {
  const [modo, setModo] = useState<ModoAlertas>(leerModo);
  useEffect(() => {
    const f = () => setModo(leerModo());
    window.addEventListener('cripto60-alertas', f); window.addEventListener('storage', f);
    return () => { window.removeEventListener('cripto60-alertas', f); window.removeEventListener('storage', f); };
  }, []);
  return modo;
}

export function PanelAperturas({ horas = 24, className = '' }: { horas?: number; className?: string }) {
  const ahora = useAhora(1000);
  const modo = useModoAlertas();
  const [permiso, setPermiso] = useState(permisoNotificaciones());
  const lista = agenda(ahora, { horas });
  const cambiar = async (m: ModoAlertas) => {
    if (m !== 'off') { prepararSonido(); setPermiso(await pedirPermiso()); sonar(); }
    guardarModo(m);
  };
  const Icono = modo === 'off' ? BellOff : modo === 'todas' ? BellRing : Bell;
  return (
    <Panel titulo="Aperturas de mercado" aside={<span className="faint" style={{ fontSize: 12 }}>ventanas de riesgo</span>} className={className}>
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Icono size={16} aria-hidden style={{ color: modo === 'off' ? 'var(--text-3)' : 'var(--accent)' }} />
          <span style={{ fontSize: 13, fontWeight: 600 }}>Avisarme 5 y 1 min antes:</span>
          <div className="seg" role="group" aria-label="Alertas de aperturas">
            {([['off', 'No'], ['fuertes', 'Solo las fuertes'], ['todas', 'Todas']] as const).map(([v, t]) => (
              <button type="button" key={v} aria-pressed={modo === v} onClick={() => cambiar(v)}>{t}</button>
            ))}
          </div>
        </div>
        {modo !== 'off' && permiso === 'denied' && <p className="warn" style={{ fontSize: 12 }}>El navegador bloqueó las notificaciones: verás el aviso y oirás el sonido solo con la app abierta en pantalla. Puedes permitirlas en la configuración del sitio.</p>}
        {modo !== 'off' && permiso === 'no-soportado' && <p className="faint" style={{ fontSize: 12 }}>Este navegador no tiene notificaciones: el aviso sale dentro de la app, con sonido.</p>}
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {lista.map((a) => {
            const golpe = a.estado === 'golpe', falta = a.t - ahora, cerca = !golpe && falta <= 15 * 60e3;
            return (
              <li key={a.clave + a.t} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 10, alignItems: 'center', padding: '9px 0', borderTop: '1px solid var(--line)' }}>
                <span className="num" style={{ fontWeight: 600, minWidth: 64 }}>{hoy(a.t, ahora) ? hora(a.t) : fechaHora(a.t)}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    <span className={`tag ${a.importancia === 'ALTA' ? 'tag-warn' : ''}`}>{a.importancia === 'ALTA' ? 'FUERTE' : 'MEDIA'}</span>
                    <span>{a.nombre}</span>
                  </span>
                  <span className="faint" style={{ fontSize: 12, display: 'block' }}>~{a.mueve_x}x lo normal en 5 min · {a.nota}</span>
                </span>
                <span className={`num ${golpe ? 'loss' : cerca ? 'warn' : 'muted'}`} style={{ fontWeight: golpe || cerca ? 700 : 500, textAlign: 'right' }} aria-live={cerca || golpe ? 'polite' : undefined}>
                  {golpe ? 'golpe ahora' : cuentaAtras(falta)}
                </span>
              </li>
            );
          })}
        </ul>
        <p className="faint" style={{ fontSize: 12 }}>Medido con 90 días de BTC y ETH: en estas aperturas el precio da un golpe fuerte de pocos minutos hacia cualquier lado. Operarlo no ganó tras comisiones, así que úsalas para no entrar justo ahí y para revisar tu SL. Las alertas funcionan mientras la app esté abierta.</p>
      </div>
    </Panel>
  );
}

// Dispara las alertas desde cualquier pantalla (va en el Shell): revisa cada 10 s si toca avisar.
export function useAlertasAperturas() {
  const { aviso } = useSesion();
  const modo = useModoAlertas();
  useEffect(() => {
    if (modo === 'off') return;
    const revisar = () => {
      for (const a of avisosPendientes(Date.now(), modo)) {
        aviso(a.texto, 12_000);
        sonar(a.urgente);
        if (permisoNotificaciones() === 'granted') {
          try { new Notification(a.urgente ? 'Cripto60 · abre en 1 minuto' : 'Cripto60 · apertura en 5 minutos', { body: a.texto, tag: a.clave }); } catch { /* móvil sin service worker: queda el aviso en la app */ }
        }
      }
    };
    revisar();
    const id = setInterval(revisar, 10_000);
    return () => clearInterval(id);
  }, [modo, aviso]);
}
