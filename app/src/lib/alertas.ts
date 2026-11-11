// Alertas de aperturas de mercado: 5 min y 1 min antes de cada apertura (todas o solo las fuertes), con
// notificación del navegador, sonido y aviso dentro de la app. Funcionan mientras la app esté abierta (en
// cualquier pantalla); la agenda se calcula aquí mismo con lib/aperturas.mjs, sin pedir nada al servidor.
import { agenda } from '../../../lib/aperturas.mjs';

export type ModoAlertas = 'off' | 'fuertes' | 'todas';
const CLAVE = 'cripto60-alertas-aperturas';
const HECHAS = 'cripto60-aperturas-avisadas';
export const AVISOS_MIN = [5, 1];

export function leerModo(): ModoAlertas {
  try { const v = localStorage.getItem(CLAVE); return v === 'fuertes' || v === 'todas' ? v : 'off'; } catch { return 'off'; }
}
export function guardarModo(m: ModoAlertas) {
  try { localStorage.setItem(CLAVE, m); } catch { /* sin almacenamiento */ }
  window.dispatchEvent(new Event('cripto60-alertas'));
}
export const permisoNotificaciones = () => (typeof Notification === 'undefined' ? 'no-soportado' : Notification.permission);
export async function pedirPermiso() {
  if (typeof Notification === 'undefined') return 'no-soportado';
  if (Notification.permission === 'default') { try { return await Notification.requestPermission(); } catch { return Notification.permission; } }
  return Notification.permission;
}

// Sonido: dos tonos cortos. El navegador solo deja sonar después de un clic del usuario, por eso el audio se
// prepara al activar las alertas (y se vuelve a intentar en cada aviso).
let ctx: AudioContext | null = null;
export function prepararSonido() {
  try { ctx ??= new AudioContext(); void ctx.resume(); } catch { /* sin audio */ }
}
export function sonar(urgente = false) {
  try {
    ctx ??= new AudioContext();
    void ctx.resume();
    const tonos = urgente ? [880, 660, 880] : [660, 880];
    tonos.forEach((f, i) => {
      const o = ctx!.createOscillator(), g = ctx!.createGain(), t0 = ctx!.currentTime + i * 0.22;
      o.frequency.value = f; o.type = 'sine';
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.2);
      o.connect(g).connect(ctx!.destination); o.start(t0); o.stop(t0 + 0.21);
    });
  } catch { /* sin audio */ }
}

function hechas(): string[] { try { return JSON.parse(localStorage.getItem(HECHAS) ?? '[]'); } catch { return []; } }
function marcar(k: string, ahora: number) {
  try {
    const l = hechas().filter((x) => +x.split(':')[1] > ahora - 864e5); // se olvidan las de hace más de un día
    l.push(k); localStorage.setItem(HECHAS, JSON.stringify(l));
  } catch { /* nada */ }
}

export interface AvisoApertura { texto: string; urgente: boolean; clave: string }
// Lo que toca avisar ahora (cada aviso sale una sola vez, aunque haya varias pestañas o se recargue la página).
export function avisosPendientes(ahora: number, modo: ModoAlertas): AvisoApertura[] {
  if (modo === 'off') return [];
  const ya = new Set(hechas());
  const out: AvisoApertura[] = [];
  for (const a of agenda(ahora, { horas: 0.2, importancia: modo === 'fuertes' ? ['ALTA'] : null })) {
    if (a.estado !== 'proxima') continue;
    const faltan = (a.t - ahora) / 60e3;
    // el aviso más cercano que ya toca (si se abrió la app a 3 min, sale el de 5 una vez y luego el de 1)
    const tipo = AVISOS_MIN.filter((m) => faltan <= m).sort((x, y) => x - y)[0];
    if (tipo == null) continue;
    const k = `${a.clave}:${a.t}:${tipo}`;
    if (ya.has(k)) continue;
    marcar(k, ahora);
    const cuando = faltan <= 1.2 ? 'en 1 minuto' : `en ${Math.max(1, Math.round(faltan))} minutos`;
    out.push({
      clave: k, urgente: tipo === 1,
      texto: `${a.nombre} ${cuando}: suele mover ~${a.mueve_x} veces lo normal en 5 min, hacia cualquier lado. No entres justo en el golpe y revisa tu SL.`,
    });
  }
  return out;
}
