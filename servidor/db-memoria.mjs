// Base de datos en memoria con la misma interfaz que la de Supabase (tests y modo demo).
export function dbMemoria({ ajustes = {}, diario = null } = {}) {
  const senales = [], instantaneas = new Map();
  let abierta = null;
  return {
    senales,
    leerAjustes: async () => ajustes,
    leerDiario: async () => diario,
    guardarSenal: async (s) => { const id = `s${senales.length + 1}`; senales.push({ ...s, id }); return id; },
    ultimaSenal: async (base) => [...senales].reverse().find((s) => s.base === base) ?? null,
    leerInstantanea: async (base) => instantaneas.get(base) ?? null,
    guardarInstantanea: async (base, doc) => { instantaneas.set(base, doc); },
    posicionAbierta: async () => abierta,
    abrir: (p) => { abierta = p; },
  };
}
