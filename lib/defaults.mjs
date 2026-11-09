// Valores por defecto del motor. Módulo puro (sin node:fs): lo usan también la web y la Edge Function.
export const DEFAULTS = {
  exchange: 'BINANCE', // de dónde salen los datos: BINANCE (por defecto), BYBIT o MEXC; se cambia con --exchange
  carpeta: 'trader',
  zona_horaria: null, // null = la del sistema. Ej: "America/La_Paz"
  // INTRADÍA CORTO: operaciones de 15 a 60 minutos, con un SL con espacio para respirar y un
  // objetivo de ganancia en USDT por operación (p. ej. 3 USDT). El apalancamiento sale del objetivo:
  // posición necesaria = objetivo / (movimiento medio de los TP); apalancamiento = posición / margen.
  // Lo frenan la pérdida máxima por confianza, la distancia a la liquidación y el tope de apalancamiento.
  mostrar_mejor_entrada: true, // siempre añadir el bloque MEJOR ENTRADA (la de más probabilidad), aunque salga NO OPERAR
  objetivo_usdt: 3, // ganancia buscada si llegan los 3 TP (0 = sin objetivo, solo riesgo)
  margen_base: 20, // USDT que pones por operación si no dices otro
  reinversion_pct: 50, // % de la ganancia acumulada que se suma al margen sugerido (interés compuesto)
  apalancamiento_max: 30, // tope propio por defecto; el usuario lo puede subir hasta apalancamiento_tope
  apalancamiento_tope: 500, // lo más alto que acepta un ajuste; además frenan el exchange y la distancia a la liquidación
  riesgo_max_pct: 10, // nunca perder más de este % del capital si salta el SL
  // pérdida máxima si salta el SL (% del capital), según la confianza del análisis
  riesgo_por_confianza: { ALTA: 10, MEDIA: 7, BAJA: 4 },
  // % de tu margen que se usa, según la confianza (incertidumbre = menos dinero en juego)
  margen_por_confianza: { ALTA: 100, MEDIA: 75, BAJA: 50 },
  tps_r: [1, 1.8, 2.6], // TP1, TP2, TP3 en múltiplos del riesgo (R)
  reparto_tps: [50, 25, 25], // TP1 cierra 50 %, TP2 otro 25 % (75 %), TP3 el resto (100 %)
  // Stop loss en ATR de 5 minutos, con espacio: un pequeño retroceso no te saca
  sl_atr_min: 0.9, sl_atr_max: 2.2, sl_colchon_atr: 0.25, sl_pct_min: 0.3,
  sl_candidatos_atr: [0.9, 1.2, 1.6, 2.0], // distancias de SL que se prueban con la simulación
  cierre_tiempo_max_pct: 35, // el SL elegido debe resolverse (TP1 o SL) en la espera en al menos el 65 % de los casos
  historial_min_ops: 12, // mínimo de operaciones comparables para que el historial cuente
  historial_r_min: -0.03, // por debajo (pierde en promedio tras comisiones): NO OPERAR
  historial_r_bueno: 0.03, // por debajo de esto la ventaja es mínima: se baja la confianza
  cierre_tiempo_no_operar_pct: 60, // si el 60 % se cierra por tiempo sin TP1, el precio no se mueve: NO OPERAR
  comision_ratio_min: 3, // el TP1 tiene que cubrir al menos 3x la comisión de ida y vuelta
  liquidacion_vs_sl: 2, // la liquidación debe quedar al menos 2x más lejos que el SL
  validez_entrada_min: 5, // si no entraste en 5 min, la señal caduca (el precio ya se movió)
  espera_min_min: 10, // espera mínima para el TP1
  espera_max_min: 30, // si el TP1 no llega en este tiempo como mucho, se cierra
  duracion_max_min: 60, // cierre total de lo que quede (tras TP1 el resto corre con SL en entrada)
  simulaciones: 5000,
  semilla: 7,
  // Diario / gestión de capital
  max_operaciones_dia: 20,
  max_operaciones_hora: 4,
  max_perdida_dia_pct: 20, // si hoy pierdes este % del capital, se para hasta mañana
  perdidas_seguidas_mitad: 2, // tras N pérdidas seguidas (hoy), riesgo a la mitad
  perdidas_seguidas_pausa: 2, // tras N pérdidas seguidas, pausa
  pausa_min: 30, // duración de la pausa
  perdidas_seguidas_parar: 4, // tras N pérdidas seguidas, parar por hoy
};
