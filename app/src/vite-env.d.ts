/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_BINANCE_PAY_ID?: string;
  readonly VITE_BINANCE_NOMBRE?: string;
  readonly VITE_BINANCE_QR?: string;
  readonly VITE_CONTACTO_URL?: string;
  readonly VITE_CONTACTO_TEXTO?: string;
  readonly VITE_SITIO_URL?: string;
}
interface ImportMeta { readonly env: ImportMetaEnv }
declare module '@fontsource-variable/inter';
