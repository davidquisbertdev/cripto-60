---
name: cripto-posicion
description: >-
  Revisa una posición abierta de futuros cripto en MEXC y dice qué hacer ahora:
  MANTENER, MOVER SL, REDUCIR o CERRAR. Mira lo que hizo el precio desde la
  entrada (TPs o SL tocados, minuto a minuto), el tiempo transcurrido frente a
  la espera máxima de la señal, las noticias publicadas desde que se abrió, si
  el análisis multi-temporalidad cambió y las probabilidades recalculadas desde
  el precio actual. Úsala cuando el usuario diga "analiza mi posición de SOL",
  "sigo en SOL, ¿qué hago?", "no llega al TP", "¿cierro?", "ya pasaron 10
  minutos", "¿muevo el stop?", "salió una noticia, ¿sigo?".
argument-hint: "MONEDA [--entrada X --sl Y --tp1 A --hace 10m]"
---

# cripto-posicion

El usuario ya entró y pregunta cómo va. Por defecto se lee la última señal
guardada (`trader/senal-<MONEDA>.json`, de `/cripto-senal`): lado, entrada, SL,
TPs, contratos, hora y espera máxima. Si el usuario da otros datos (su precio de
entrada real, cuándo entró, otro SL), pásalos como opciones.

```bash
node "${CLAUDE_SKILL_DIR}/posicion.mjs" SOL                                  # según la última señal de SOL
node "${CLAUDE_SKILL_DIR}/posicion.mjs" SOL --entrada 89.52 --hace 7m        # entrada real y desde cuándo
node "${CLAUDE_SKILL_DIR}/posicion.mjs" SOL --lado short --entrada 89.5 --sl 90 --tp1 89 --tp2 88.5 --tp3 88 --hace 20m --espera 1h
node "${CLAUDE_SKILL_DIR}/posicion.mjs" SOL --json
```

Opciones: `--lado`, `--entrada`, `--sl`, `--tp1`, `--tp2`, `--tp3`,
`--contratos`, `--hace 15m` o `--abierta "2026-11-07 10:30"` (hora local),
`--espera 45m` (espera máxima si no hay señal guardada), `--sin-noticias`,
`--offline DIR`.

## Qué decide, en este orden

1. **CERRADA (SL)**, **CERRADA (stop movido)** o **COMPLETADA**: si las velas de
   1 minuto muestran que ya tocó el SL, el stop movido o todos los TP. Si la
   posición sigue abierta en MEXC, debe cerrarse ya.
2. **CERRAR**: si desde la entrada salió una noticia en contra (hack,
   deslistado o sentimiento claramente contrario).
3. **CERRAR**: si el análisis cambió de lado con confianza de 50 o más (si va
   en ganancia: "asegura ganancia").
4. **CERRAR**: si pasó la espera máxima y el TP1 no llegó.
5. **MANTENER con SL movido**: si ya tocó un TP, recuerda cerrar la parte
   correspondiente y mover el SL (a la entrada tras el TP1, al TP1 tras el
   TP2). Si además el impulso se debilitó: **REDUCIR**.
6. **REDUCIR**: si la confianza bajó 15 puntos o más respecto a la señal, si el
   análisis empieza a girar, o si desde aquí la probabilidad del siguiente TP
   es menos del 40 % de la suma "TP o stop". Da un SL más cercano (a mitad de
   camino).
7. **MANTENER**: el plan sigue en pie. Di el tiempo que queda y la hora límite.

## Pasos

1. Si el usuario dice cuándo entró o a qué precio, pásalo (`--hace`,
   `--entrada`). Si no hay señal guardada, pídele lado, entrada, SL y TPs.
2. Ejecuta `posicion.mjs`.
3. Si tienes WebSearch, busca noticias de la última hora de la moneda y del
   mercado (Fed, CPI, liquidaciones grandes, hacks) y súmalas al juicio.
4. Responde corto: la **ACCIÓN** en mayúsculas, el porqué en una o dos frases,
   qué tocar exactamente en MEXC (cerrar X %, mover el SL a Y), el tiempo que
   queda para el TP1 y las probabilidades desde aquí.
5. Si se cerró (por TP, SL o tiempo), sugiere registrar el resultado:
   `/cripto-diario registrar SOL --pnl <USDT>`.

No es asesoría financiera. Tú no tocas la cuenta: el usuario ejecuta en MEXC.
