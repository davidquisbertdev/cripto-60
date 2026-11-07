// Plan de la operación: entrada, stop loss, TP1/TP2/TP3, tamaño en contratos MEXC, apalancamiento,
// margen, precio de liquidación aproximado y ganancia/pérdida en USDT en cada escenario.

export function decimales(unidad) {
  const s = String(unidad);
  if (s.includes('e-')) return +s.split('e-')[1];
  return s.includes('.') ? s.split('.')[1].length : 0;
}

// modo: 'abajo' | 'arriba' | 'cerca'
export function redondear(x, unidad, modo = 'cerca') {
  const d = decimales(unidad);
  const n = x / unidad;
  const k = modo === 'abajo' ? Math.floor(n + 1e-9) : modo === 'arriba' ? Math.ceil(n - 1e-9) : Math.round(n);
  return +(k * unidad).toFixed(d);
}

export function stopLoss({ lado, entrada, atr15, soporte, resistencia }) {
  const min = Math.max(0.8 * atr15, 0.0025 * entrada);
  const max = Math.max(2.5 * atr15, min * 1.5);
  const nivel = lado === 'LONG' ? soporte : resistencia;
  let dist, regla;
  if (nivel != null) {
    const d = lado === 'LONG' ? entrada - (nivel - 0.25 * atr15) : nivel + 0.25 * atr15 - entrada;
    if (d >= min && d <= max) { dist = d; regla = `detrás ${lado === 'LONG' ? 'del soporte' : 'de la resistencia'} ${nivel} (15m) + 0.25 ATR`; }
    else if (d < min) { dist = Math.max(min, 1.2 * atr15); regla = `1.2 ATR(15m): ${lado === 'LONG' ? 'el soporte' : 'la resistencia'} estaba demasiado cerca`; }
    else { dist = max; regla = `2.5 ATR(15m): la estructura estaba demasiado lejos`; }
  } else { dist = 1.5 * atr15; regla = '1.5 ATR(15m)'; }
  return { dist, regla };
}

export function repartir(contratos, reparto) {
  if (contratos <= 0) return [0, 0, 0];
  if (contratos === 1) return [1, 0, 0];
  if (contratos === 2) return [1, 1, 0];
  const c1 = Math.max(1, Math.round((contratos * reparto[0]) / 100));
  const c2 = Math.max(1, Math.round((contratos * reparto[1]) / 100));
  const c3 = Math.max(0, contratos - c1 - c2);
  return [c1, Math.min(c2, contratos - c1), c3];
}

export function calcularPlan({ lado, entrada, atr15, soporte, resistencia, contrato, capital, nivel, cfg, factorRiesgo = 1, objetivo = null }) {
  const L = lado === 'LONG' ? 1 : -1;
  const unidad = contrato.priceUnit;
  const taker = +contrato.takerFeeRate || 0, maker = +contrato.makerFeeRate || 0, mmr = +contrato.maintenanceMarginRate || 0.005;
  const tam = +contrato.contractSize;

  const sl0 = stopLoss({ lado, entrada, atr15, soporte, resistencia });
  const sl = redondear(entrada - L * sl0.dist, unidad, L > 0 ? 'abajo' : 'arriba');
  const R = Math.abs(entrada - sl);
  const slPct = R / entrada;
  const tps = cfg.tps_r.map((r) => redondear(entrada + L * r * R, unidad, L > 0 ? 'abajo' : 'arriba'));

  const nivelRiesgo = nivel === 'NO OPERAR' ? 'BAJA' : nivel;
  const riesgoPct = Math.min(cfg.riesgo_por_confianza[nivelRiesgo] * factorRiesgo, cfg.riesgo_max_pct);
  const margenPct = cfg.margen_por_confianza[nivelRiesgo];
  const riesgoObj = (capital * riesgoPct) / 100;
  const margenDisp = (capital * margenPct) / 100;

  // Nocional tal que perder en el SL (precio + comisiones taker de entrada y salida) = riesgoObj
  let nocional = riesgoObj / (slPct + 2 * taker);
  const levLiq = Math.floor(1 / (cfg.liquidacion_vs_sl * slPct + mmr));
  const levMax = Math.max(1, Math.min(cfg.apalancamiento_max, +contrato.maxLeverage || 125, levLiq));
  const levNec = Math.ceil(nocional / margenDisp - 1e-9);
  const lev = Math.max(1, Math.min(levNec, levMax));
  const avisos = [];
  if (levNec > levMax) {
    nocional = margenDisp * lev;
    avisos.push(`Para arriesgar ${riesgoPct} % haría falta ${levNec}x; el tope seguro es ${levMax}x, así que el riesgo real es menor.`);
  }
  const valorContrato = tam * entrada;
  let contratos = Math.floor(nocional / valorContrato + 1e-9);
  const minVol = +contrato.minVol || 1;
  if (contratos < minVol) {
    const margenMin = (minVol * valorContrato) / lev;
    const riesgoMin = minVol * valorContrato * (slPct + 2 * taker);
    if (margenMin <= capital && riesgoMin <= (capital * cfg.riesgo_max_pct) / 100) {
      contratos = minVol;
      avisos.push(`Con este capital solo alcanza el mínimo de ${minVol} contrato(s).`);
    } else {
      return { viable: false, motivo: `Capital insuficiente: el mínimo (${minVol} contrato = ${valorContrato.toFixed(2)} USDT) necesita ${margenMin.toFixed(2)} USDT de margen a ${lev}x y arriesgaría ${riesgoMin.toFixed(2)} USDT.`, sl, tps, R };
    }
  }
  const nocionalReal = contratos * valorContrato;
  const margen = nocionalReal / lev;
  const liq = redondear(entrada * (1 - L * (1 / lev - mmr)), unidad);
  const feeEntrada = nocionalReal * taker;
  const perdidaSL = nocionalReal * slPct + feeEntrada + nocionalReal * (1 - L * slPct) * taker;

  const partes = repartir(contratos, cfg.reparto_tps);
  const gan = tps.map((tp, i) => {
    const q = partes[i] * tam;
    const bruto = q * Math.abs(tp - entrada);
    const fee = q * tp * maker + (partes[i] / contratos) * feeEntrada;
    return +(bruto - fee).toFixed(4);
  });
  const pct = (x) => +((100 * x) / margen).toFixed(1);
  const totalTodos = gan.reduce((a, b) => a + b, 0);
  const restoTrasTP1 = contratos - partes[0];
  const feeBE = restoTrasTP1 * tam * entrada * taker + (restoTrasTP1 / contratos) * feeEntrada;
  const escenarios = {
    sl_directo: -+perdidaSL.toFixed(4),
    tp1_y_luego_be: +(gan[0] - (restoTrasTP1 ? feeBE : 0)).toFixed(4),
    tp1_tp2_y_luego_tp1: +(gan[0] + gan[1] + (partes[2] ? partes[2] * tam * Math.abs(tps[0] - entrada) - partes[2] * tam * tps[0] * taker - (partes[2] / contratos) * feeEntrada : 0)).toFixed(4),
    todos_los_tps: +totalTodos.toFixed(4),
  };

  let objetivoInfo = null;
  if (objetivo != null && objetivo > 0) {
    const porRiesgo = totalTodos / perdidaSL;
    const riesgoNec = objetivo / porRiesgo;
    const pctNec = (100 * riesgoNec) / capital;
    objetivoInfo = {
      objetivo, alcanzable: totalTodos >= objetivo - 1e-9,
      riesgo_necesario: +riesgoNec.toFixed(2), riesgo_necesario_pct: +pctNec.toFixed(1),
      mensaje: totalTodos >= objetivo - 1e-9
        ? `Si llegan los 3 TP ganas ${totalTodos.toFixed(2)} USDT: cubre tu objetivo de ${objetivo} USDT.`
        : pctNec > cfg.riesgo_max_pct
          ? `Sacar ${objetivo} USDT exigiría arriesgar ${riesgoNec.toFixed(2)} USDT (${pctNec.toFixed(0)} % del capital), por encima de tu tope de ${cfg.riesgo_max_pct} %. Lo realista hoy es ${totalTodos.toFixed(2)} USDT si llegan los 3 TP.`
          : `Con la confianza actual el plan apunta a ${totalTodos.toFixed(2)} USDT. Para ${objetivo} USDT habría que arriesgar ${riesgoNec.toFixed(2)} USDT (${pctNec.toFixed(1)} %); no se sube el riesgo con confianza ${nivelRiesgo}.`,
    };
  }

  return {
    viable: true, lado, entrada, sl, sl_regla: sl0.regla, R: +R.toFixed(decimales(unidad) + 2), sl_pct: +(100 * slPct).toFixed(3),
    tps: tps.map((p, i) => ({
      n: i + 1, precio: p, r: cfg.tps_r[i], cerrar_pct: cfg.reparto_tps[i], contratos: partes[i],
      movimiento_pct: +((100 * Math.abs(p - entrada)) / entrada).toFixed(3), ganancia_usdt: gan[i], roe_pct: pct(gan[i]),
    })),
    contratos, tam_contrato: tam, cantidad_moneda: +(contratos * tam).toPrecision(10), nocional: +nocionalReal.toFixed(4),
    apalancamiento: lev, apalancamiento_max_seguro: levMax, margen: +margen.toFixed(4), margen_pct_capital: +((100 * margen) / capital).toFixed(1),
    liquidacion: liq, riesgo_pct_objetivo: riesgoPct, riesgo_usdt: +perdidaSL.toFixed(4), riesgo_pct_real: +((100 * perdidaSL) / capital).toFixed(2),
    comisiones: { taker, maker }, escenarios, objetivo: objetivoInfo, avisos,
  };
}
