// Configuración (trader/config.json) y diario de operaciones (trader/diario.json).
import fs from 'node:fs';
import path from 'node:path';
import { DEFAULTS, aplicarRiesgo } from './defaults.mjs';

export { DEFAULTS } from './defaults.mjs';
export { diaLocal, estadoDiario } from './diario.mjs';

export function carpeta(cfg) {
  return path.resolve(process.cwd(), cfg.carpeta || 'trader');
}

export function leerConfig(ruta) {
  const f = ruta || path.resolve(process.cwd(), 'trader', 'config.json');
  let propio = {};
  if (fs.existsSync(f)) {
    try { propio = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) {
      throw new Error(`trader/config.json no es JSON válido: ${e.message}`);
    }
  }
  const cfg = { ...DEFAULTS, ...propio };
  cfg.riesgo_por_confianza = { ...DEFAULTS.riesgo_por_confianza, ...(propio.riesgo_por_confianza || {}) };
  cfg.margen_por_confianza = { ...DEFAULTS.margen_por_confianza, ...(propio.margen_por_confianza || {}) };
  return aplicarRiesgo(cfg);
}

export function leerJSON(f, defecto = null) {
  if (!fs.existsSync(f)) return defecto;
  return JSON.parse(fs.readFileSync(f, 'utf8'));
}

export function escribirJSON(f, doc) {
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(doc, null, 2) + '\n');
  fs.renameSync(tmp, f);
}

export function rutaDiario(cfg) { return path.join(carpeta(cfg), 'diario.json'); }
export function rutaSenal(cfg, base) { return path.join(carpeta(cfg), `senal-${base}.json`); }
