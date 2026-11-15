import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// robots.txt y sitemap.xml con la dirección pública del sitio (VITE_SITIO_URL en app/.env). Solo se
// indexan las páginas públicas; el resto de la app pide sesión.
function seo(sitio: string): Plugin {
  const paginas = [['/', '1.0'], ['/suscripcion', '0.8'], ['/terminos', '0.3']];
  const robots = `User-agent: *\nAllow: /\nDisallow: /entrar\n\nSitemap: ${sitio}/sitemap.xml\n`;
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paginas.map(([p, pr]) => `  <url><loc>${sitio}${p}</loc><changefreq>weekly</changefreq><priority>${pr}</priority></url>`).join('\n')}\n</urlset>\n`;
  return {
    name: 'cripto60-seo',
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: robots });
      this.emitFile({ type: 'asset', fileName: 'sitemap.xml', source: sitemap });
    },
  };
}

// El motor (../lib) se importa directamente en el modo demo: hay que permitir leer fuera de app/.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_');
  const sitio = (env.VITE_SITIO_URL || 'https://cripto60-app.web.app').replace(/\/$/, '');
  return {
    plugins: [react(), seo(sitio)],
    server: { fs: { allow: ['..'] } },
  };
});
