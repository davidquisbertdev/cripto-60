#!/usr/bin/env node
// Copia el motor (lib/, las skills y servidor/acciones.mjs) a supabase/functions/_shared/motor/ para que la
// Edge Function lo despliegue. Es una copia generada: el código fuente sigue siendo el de la raíz del repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEST = path.join(RAIZ, 'supabase', 'functions', '_shared', 'motor');
fs.rmSync(DEST, { recursive: true, force: true });
const copiar = (rel) => { const d = path.join(DEST, rel); fs.mkdirSync(path.dirname(d), { recursive: true }); fs.copyFileSync(path.join(RAIZ, rel), d); };
let n = 0;
for (const f of fs.readdirSync(path.join(RAIZ, 'lib'))) if (f.endsWith('.mjs')) { copiar(path.join('lib', f)); n++; }
for (const d of fs.readdirSync(RAIZ)) {
  if (!d.startsWith('cripto-')) continue;
  for (const f of fs.readdirSync(path.join(RAIZ, d))) if (f.endsWith('.mjs')) { copiar(path.join(d, f)); n++; }
}
copiar(path.join('servidor', 'acciones.mjs')); n++;
console.log(`motor copiado a ${path.relative(RAIZ, DEST)} (${n} archivos)`);
