// Edge Function «motor»: ejecuta el motor de Cripto Trader (el mismo de las skills) para el usuario
// autenticado. El código del motor se copia a ../_shared/motor con `npm run motor:sync` antes de desplegar.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.46.1';
import { ejecutar, ErrorUsuario } from '../_shared/motor/servidor/acciones.mjs';

const ORIGENES = (Deno.env.get('ORIGENES_PERMITIDOS') ?? '*').split(',').map((s) => s.trim());

function cors(req: Request) {
  const origen = req.headers.get('origin') ?? '';
  const permitido = ORIGENES.includes('*') ? '*' : ORIGENES.includes(origen) ? origen : ORIGENES[0];
  return {
    'Access-Control-Allow-Origin': permitido,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

const n = (x: unknown) => (x == null ? null : Number(x));

function dbDe(sb: SupabaseClient, uid: string) {
  const falla = (e: { message: string } | null) => { if (e) throw new Error(`Base de datos: ${e.message}`); };
  return {
    async leerAjustes() {
      const { data, error } = await sb.from('perfiles').select('ajustes').eq('id', uid).maybeSingle();
      falla(error);
      return data?.ajustes ?? {};
    },
    async leerDiario() {
      const { data: p, error } = await sb.from('perfiles').select('capital_inicial').eq('id', uid).maybeSingle();
      falla(error);
      if (!p?.capital_inicial) return null;
      const { data: ops, error: e2 } = await sb.from('operaciones').select('id, fecha, simbolo, lado, pnl, margen, nota').order('fecha', { ascending: true }).limit(5000);
      falla(e2);
      return { capital_inicial: n(p.capital_inicial), operaciones: (ops ?? []).map((o) => ({ ...o, pnl: n(o.pnl), margen: n(o.margen) })) };
    },
    async guardarSenal(s: { base: string; recomendacion: string }) {
      const { data, error } = await sb.from('senales').insert({ base: s.base, recomendacion: s.recomendacion, datos: s }).select('id').single();
      falla(error);
      return data!.id;
    },
    async ultimaSenal(base: string) {
      const { data, error } = await sb.from('senales').select('id, datos').eq('base', base).order('creada', { ascending: false }).limit(1).maybeSingle();
      falla(error);
      return data ? { ...data.datos, id: data.id } : null;
    },
    async leerInstantanea(base: string) {
      const { data, error } = await sb.from('instantaneas_ballenas').select('datos').eq('base', base).maybeSingle();
      falla(error);
      return data?.datos ?? null;
    },
    async guardarInstantanea(base: string, datos: unknown) {
      const { error } = await sb.from('instantaneas_ballenas').upsert({ user_id: uid, base, datos, actualizada: new Date().toISOString() });
      falla(error);
    },
    async posicionAbierta() {
      const { data, error } = await sb.from('posiciones').select('*').is('cerrada', null).maybeSingle();
      falla(error);
      return data;
    },
  };
}

Deno.serve(async (req) => {
  const h = { ...cors(req), 'Content-Type': 'application/json' };
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Usa POST.' }), { status: 405, headers: h });

  const auth = req.headers.get('Authorization');
  if (!auth) return new Response(JSON.stringify({ error: 'Inicia sesión.' }), { status: 401, headers: h });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, { global: { headers: { Authorization: auth } } });
  const { data: u, error: eu } = await sb.auth.getUser();
  if (eu || !u?.user) return new Response(JSON.stringify({ error: 'La sesión caducó. Vuelve a entrar.' }), { status: 401, headers: h });
  // Solo las cuentas con la suscripción al día usan el motor
  const { data: activa, error: es } = await sb.rpc('suscripcion_activa');
  if (es) { console.error(es); return new Response(JSON.stringify({ error: 'No se pudo comprobar tu suscripción. Prueba de nuevo en un minuto.' }), { status: 502, headers: h }); }
  if (!activa) return new Response(JSON.stringify({ error: 'Tu suscripción no está activa. Renuévala para seguir usando Cripto60.', suscripcion: false }), { status: 402, headers: h });

  let cuerpo: { accion?: string; params?: Record<string, unknown> };
  try { cuerpo = await req.json(); } catch { return new Response(JSON.stringify({ error: 'Petición sin JSON válido.' }), { status: 400, headers: h }); }

  try {
    const r = await ejecutar(String(cuerpo.accion ?? ''), cuerpo.params ?? {}, { db: dbDe(sb, u.user.id) });
    return new Response(JSON.stringify(r), { headers: h });
  } catch (e) {
    const err = e as Error & { estado?: number };
    const usuario = e instanceof ErrorUsuario || /no es una criptomoneda|no está activo|muy poco historial|Indica tu capital|margen/.test(err.message);
    console.error(err);
    return new Response(JSON.stringify({ error: usuario ? err.message : 'El motor no pudo leer los datos del exchange. Prueba de nuevo en un minuto.' }), {
      status: usuario ? err.estado ?? 400 : 502, headers: h,
    });
  }
});
