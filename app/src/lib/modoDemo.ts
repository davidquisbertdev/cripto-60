// "Ver demo" para quien no tiene cuenta o suscripción: la app entera funciona con salidas reales del motor
// grabadas (el mismo modo demo de cuando no hay Supabase), sin login. Se recuerda en este navegador hasta
// que se pulsa "Salir del demo". Si había una sesión iniciada, sigue guardada y vuelve al salir.
const CLAVE = 'cripto60-ver-demo';

export const demoElegido = (() => {
  try { return localStorage.getItem(CLAVE) === '1'; } catch { return false; }
})();

export function entrarDemo() {
  try { localStorage.setItem(CLAVE, '1'); } catch { /* sin almacenamiento: no se puede recordar */ }
  window.location.assign('/');
}

export function salirDemo(destino = '/') {
  try { localStorage.removeItem(CLAVE); localStorage.removeItem('cripto-trader-demo-v1'); } catch { /* nada */ }
  window.location.assign(destino);
}
