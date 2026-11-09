import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// El motor (../lib) se importa directamente en el modo demo: hay que permitir leer fuera de app/.
export default defineConfig({
  plugins: [react()],
  server: { fs: { allow: ['..'] } },
});
