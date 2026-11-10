import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { demoElegido } from './modoDemo';

const url = import.meta.env.VITE_SUPABASE_URL;
const clave = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Sin credenciales, o si el visitante pulsó "Ver demo", la app corre en modo demo con datos grabados.
export const supabase: SupabaseClient | null = url && clave && !demoElegido ? createClient(url, clave, { auth: { persistSession: true, autoRefreshToken: true } }) : null;
export const hayBackend = !!supabase;
