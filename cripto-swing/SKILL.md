---
name: cripto-swing
description: >-
  Swing trading de futuros cripto: operaciones de días a semanas en velas
  diarias. Elige el setup que gana en el historial real de 2 años de la moneda
  (ruptura de 20 días, retroceso a la media de 20 o reversión en extremos, con
  comisiones y funding) y da SEÑAL SWING (LONG, SHORT o ESPERAR) con zona de
  entrada escalonada, stop loss, TP1 donde se cierra el 50 %, trailing del
  resto, días esperados, apalancamiento bajo y funding estimado; o los niveles
  a vigilar con su plan si se activan. Registra tus entradas y salidas y las
  revisa días después (MANTENER, MOVER SL, REDUCIR o CERRAR). Úsala cuando el
  usuario diga "swing en ETH", "operación de varios días", "¿dónde entro para
  semanas?", "entré en BTC a X", "revisa mis swings", "¿ya llegó al TP?".
argument-hint: "MONEDA [--capital 1000] | MONEDA --entrar PRECIO | MONEDA --salir PRECIO | revisar"
---

# cripto-swing

Operaciones de **días a semanas** (no de minutos): velas diarias, SL amplio en la
estructura (3–10 %), apalancamiento bajo y el **funding** contado, porque se paga
cada 8 horas durante toda la operación.

```bash
node "${CLAUDE_SKILL_DIR}/swing.mjs" ETH --capital 1000          # análisis y plan (o niveles a vigilar)
node "${CLAUDE_SKILL_DIR}/swing.mjs" ETH --entrar 2050 --lado short   # guarda tu entrada (SL/TP1 del plan)
node "${CLAUDE_SKILL_DIR}/swing.mjs" ETH --entrar 2050 --sl 2200 --tp1 1700  # con tus niveles
node "${CLAUDE_SKILL_DIR}/swing.mjs" revisar                      # ¿cerca del TP1? ¿rompió el SL? ¿mover SL?
node "${CLAUDE_SKILL_DIR}/swing.mjs" ETH --salir 1900 --porcentaje 50  # registra una salida
```

Las operaciones se guardan en `trader/swing.json` (en la web, en la cuenta).

## Cómo decide

- Prueba tres setups en los últimos ~2,5 años de velas diarias de la moneda, con
  comisiones y funding en contra, y usa solo los que ganan en total y en las dos
  mitades del periodo:
  - **Ruptura de 20 días** a favor de la media de 200 (el que mejor funcionó en
    BTC y ETH): entrada al cierre más allá del máximo o mínimo de 20 días, SL a
    2 ATR diarios, TP1 a 3R.
  - **Retroceso** a la media de 20 días en tendencia (SL en la estructura, TP1 a 2R).
  - **Reversión** con RSI diario extremo (TP en la media de 20; va contra la tendencia).
- En el TP1 se cierra el 50 % y el SL pasa a la entrada; el resto sigue con un
  SL dinámico en el mínimo (o máximo) de los últimos 10 días, 30 días como mucho.
- Riesgo: 2 % del capital como mucho (menos con confianza MEDIA o BAJA) y
  apalancamiento de 10x como máximo.
- Si ningún setup gana en esa moneda: ESPERAR.

No es asesoría financiera: es un cálculo con datos públicos.
