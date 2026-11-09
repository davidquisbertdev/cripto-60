// Tipos de la salida del motor (lib/ y las skills). Solo los campos que la web usa.
export type Lado = 'LONG' | 'SHORT';
export type Nivel = 'ALTA' | 'MEDIA' | 'BAJA' | 'NO OPERAR';
export type Estrategia = 'tendencia' | 'reversion';

export interface TP { n: number; precio: number; r?: number; cerrar_pct: number; contratos: number; movimiento_pct?: number; ganancia_usdt?: number; roe_pct?: number }
export interface Plan {
  viable: boolean; lado: Lado; entrada: number; sl: number; sl_regla: string; sl_pct: number; R: number; tps: TP[];
  contratos: number; cantidad_moneda: number; nocional: number; apalancamiento: number; apalancamiento_razon: string;
  margen: number; margen_pct_capital: number; liquidacion: number; riesgo_usdt: number; riesgo_pct_real: number;
  comisiones: { taker: number; maker: number; tp1_cubre_x: number };
  escenarios: { sl_directo: number; tp1_y_luego_be: number; tp1_tp2_y_luego_tp1: number; todos_los_tps: number };
  objetivo?: { objetivo: number; alcanzable: boolean; mensaje?: string };
  avisos?: string[]; motivo?: string;
}
export interface Simulacion {
  simulaciones: number; horizonte_min: number;
  prob: { tp1: number; tp2: number; tp3: number; sl_antes_tp1: number; be_tras_tp1: number; cierre_por_tiempo: number };
  minutos_tp1: { p25: number; mediana: number; p75: number; p90: number };
  r_esperado: number;
}
export interface HistResumen { n: number; acierto_pct: number; r_medio_neto: number }
export interface Historial extends HistResumen { horas: number; tp1_pct: number; sl_pct: number; tiempo_pct: number; minutos_medio: number; filtro_btc?: { evitadas: number; r_medio_evitadas: number } | null }
export interface EstadoDiario {
  capital: number; capital_inicial: number; operaciones: number; ganadas: number; perdidas: number; tasa_acierto: number | null;
  hoy: { fecha: string; operaciones: number; pnl: number; ultima_hora: number };
  margen_sugerido: number; perdidas_seguidas: number; factor_riesgo: number; bloqueo: string | null; pausa_hasta: number | null; avisos: string[];
}
export interface MejorEntrada {
  lado: Lado; estrategia: Estrategia; nivel: Nivel; recomendada: boolean; prob: { pct: number; fuente: string };
  entrada: { mercado: number; limit: number; valida_hasta: number }; sl: number; tps: TP[];
  apalancamiento: number; margen: number; contratos: number; cantidad_moneda: number; nocional: number;
  riesgo_usdt: number; ganancia_todos: number; ganancia_tp1: number; liquidacion: number; cerrar_si_no_tp1_a_las: number; cierre_total_a_las: number;
}
export interface Noticia { titulo: string; fecha: number; fuente: string; sentimiento: number; enlace?: string; resumen?: string; riesgo?: boolean }
export interface Senal {
  id?: string | number; tipo: 'senal'; estrategia: Estrategia; simbolo: string; base: string; exchange: string; creada: number;
  recomendacion: Lado | 'NO OPERAR'; lado: Lado; nivel: Nivel; confianza: number; razones: string[]; alertas: string[]; capital: number;
  precio: number; decimales: number; entrada: { mercado: number; limit: number; no_perseguir: number; valida_hasta: number };
  plan: Plan; simulacion: Simulacion | null; historial: Historial | null;
  alternativa: { estrategia: Estrategia; lado: Lado; nivel: Nivel; confianza: number; historial: HistResumen | null } | null;
  estrategias_evaluadas: { estrategia: Estrategia; lado: Lado; nivel: Nivel; confianza: number; btc: string | null; historial: HistResumen | null }[];
  btc_filtro: { estado: string; bloquea: boolean; texto: string | null } | null;
  espera_max_min: number | null; cerrar_si_no_tp1_a_las: number | null; duracion_max_min: number; cierre_total_a_las: number;
  reentrada?: { long_si_rompe: number; short_si_pierde: number; rebote_long_bajo: number; rebote_short_sobre: number } | null;
  contexto: { funding: number | null; minutos_a_funding: number | null; spread_pct: number | null; cambio_24h_pct: number | null; cambio_15m_pct: number | null; atr5_pct: number; rsi: Record<string, number | null>; fng: { valor: number; clase: string } | null; niveles5: { soporte: number; resistencia: number } };
  noticias: { sentimiento: number; evento_riesgo: string | null; propias: Noticia[] } | null;
  ballenas: { puntuacion: number; lectura: string; frases: string[] } | null;
  mejor_entrada: MejorEntrada | null; diario: EstadoDiario | null;
}
export interface Bloqueo { bloqueado: true; motivo: string; pausa_hasta: number | null }
export type AccionPos = 'MANTENER' | 'MANTENER con SL movido' | 'REDUCIR' | 'CERRAR' | 'CERRAR (asegura ganancia)' | 'CERRADA (SL)' | 'COMPLETADA' | 'CERRADA (stop movido)';
export interface EvalPosicion {
  base: string; simbolo: string; ahora: number; precio: number; decimales: number; accion: AccionPos; motivo: string; pasos: string[];
  r_actual: number; transcurrido_min: number; recorrido: { hit: number; stop: number; cierre: { tipo: string; precio: number; t: number } | null };
  pnl: { realizado: number; flotante: number; contratos_abiertos: number | null } | null;
  analisis: { sesgo: Lado; nivel: Nivel; confianza: number; razones: string[]; alertas: string[] };
  prob_siguiente_tp: number | null; prob_stop: number | null; siguiente: string | null;
  noticias_nuevas: Noticia[];
  ballenas: { lectura: string; en_contra: boolean; frases: string[] } | null;
  btc: { lectura: string; estado: string; en_contra: boolean; texto: string | null } | null;
  posicion: { lado: Lado; entrada: number; sl: number; tps: number[]; abierta: number; espera_max_min: number; duracion_max_min: number; estrategia: Estrategia; contratos: number | null };
}
export interface FiltroBTC { estado: string; ajuste_conf: number; bloquea: boolean; bajar: number; texto: string | null }
export interface InformeBTC {
  ahora: number;
  btc: { precio: number; puntuacion: number; tendencia_mayor: number; lectura: string; fuerza: string; lateral: boolean; adx15m: number; cambio_15m_pct: number; cambio_1h_pct: number; rsi_5m: number; marcos: Record<string, { score: number; dir: string; rsi: number; adx: number }>; soporte_5m: number; resistencia_5m: number; frases: string[] };
  alt: { base: string; relacion: { correlacion: number; beta: number; velas: number }; peso: number; long: FiltroBTC; short: FiltroBTC; long_rev: FiltroBTC; short_rev: FiltroBTC } | null;
}
export interface PosBallena { dir: string; nombre: string | null; lado: Lado; valor: number; entrada: number; pnl: number; apalancamiento: number; liquidacion: number | null; cuenta: number; conviccion_pct: number }
export interface Flujo { abrieron_long: number; cerraron_long: number; abrieron_short: number; cerraron_short: number; operaciones: number; neto: number }
export interface InformeBallenas {
  base: string; ahora: number; precio: number; decimales: number; puntuacion: number; lectura: string; cobertura: number;
  componentes: Record<string, number | null>; frases: string[];
  hl: { disponible: boolean; motivo?: string; criterio?: string; cuentas_revisadas?: number; longs?: number; shorts?: number; valor_long?: number; valor_short?: number; posiciones?: PosBallena[]; flujo_1h?: Flujo; flujo_4h?: Flujo; flujo_24h?: Flujo } | null;
  posicionamiento: { fuente: string; top_long: number | null; minoristas_long: number | null } | null;
  oi: { cambio_15m_pct: number | null; tipo: string } | null;
  grandes: { compras_usd: number; ventas_usd: number; n: number; umbral_usd: number } | null;
  muros: { compra: { precio: number; usd: number } | null; venta: { precio: number; usd: number } | null } | null;
  desde_anterior: { minutos?: number; frases?: string[] } | null;
}
export interface InformeNoticias { ahora: number; horas: number; fng: { valor: number; clase: string; ayer: number | null } | null; monedas: { moneda: string; propias: Noticia[]; macro: Noticia[]; sentimiento: number; evento_riesgo: string | null; errores: string[] }[] }
export interface FilaEscaner { simbolo: string; precio: number; sesgo: Lado; nivel: Nivel; confianza: number; cambio_15m: number | null; volumen_24h_musdt: number; funding_pct: number; atr5_pct: number; comision_pct: number; spread_pct: number | null; reversion: { lado: Lado; nivel: Nivel; confianza: number } | null; cero_promo: boolean; apto: boolean; motivo_no_apto: string | null; lateral: boolean }
export interface InformeEscaner { ahora: number; exchange: string; btc: number; analizadas: number; aptas: number; filas: FilaEscaner[] }
export interface Ajustes {
  exchange?: 'BINANCE' | 'BYBIT' | 'MEXC'; zona_horaria?: string | null; objetivo_usdt?: number; margen_base?: number; reinversion_pct?: number; apalancamiento_max?: number;
  riesgo_por_confianza?: { ALTA: number; MEDIA: number; BAJA: number }; max_perdida_dia_pct?: number; max_operaciones_dia?: number; max_operaciones_hora?: number; pausa_min?: number;
}
export interface Estado { ahora: number; cfg: Required<Ajustes> & Record<string, unknown>; diario: EstadoDiario | null; posicion_abierta: PosicionGuardada | null }
export interface Operacion { id: number; fecha: string; simbolo: string; lado: Lado | null; pnl: number; margen: number | null; nota: string | null }
export interface Perfil { id: string; nombre: string | null; capital_inicial: number | null; ajustes: Ajustes; acepto_aviso_en: string | null }
export interface PosicionGuardada { id: number; base: string; lado: Lado; entrada: number; sl: number; tps: number[]; contratos: number | null; estrategia: Estrategia; abierta: string; senal_id: number | null }
