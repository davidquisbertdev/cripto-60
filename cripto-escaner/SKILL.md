---
name: cripto-escaner
description: >-
  Escáner de operaciones cortas (15-60 min) de futuros cripto (Binance por defecto, o Bybit o MEXC): toma los perpetuos USDT con más
  volumen (solo cripto, sin acciones, metales ni stablecoins), los analiza en
  1m, 5m y 15m con el contexto de BTC, comprueba si son aptos para operaciones cortas
  (volatilidad de 5m frente a sus comisiones y spread), muestra la lectura de
  TENDENCIA y si hay setup de REVERSIÓN a la media, y los ordena: primero
  los aptos, luego por confianza. Marca las monedas con promoción de 0
  comisión. Úsala cuando el usuario pregunte "¿qué moneda opero ahora?",
  "busca oportunidades", "escanea", "¿cuál se mueve?", "siguiente moneda",
  "¿cuáles tienen 0 comisión?".
argument-hint: "[--top 30] [--mostrar 15] [--confirmar 5] [--capital X]"
---

# cripto-escaner (operaciones de 15-60 min)

```bash
node "${CLAUDE_SKILL_DIR}/escaner.mjs"                          # top 30 por volumen, muestra 15
node "${CLAUDE_SKILL_DIR}/escaner.mjs" --top 60 --mostrar 20
node "${CLAUDE_SKILL_DIR}/escaner.mjs" --min-volumen 20000000   # solo las de más de 20 M USDT al día
node "${CLAUDE_SKILL_DIR}/escaner.mjs" --confirmar 8 --capital 20   # confirma las 8 mejores con la señal completa
node "${CLAUDE_SKILL_DIR}/escaner.mjs" --json
```

Tarda unos segundos por moneda (3 peticiones por cada una). Además, las 5 mejores aptas
(`--confirmar N`, 0 para no confirmar) pasan por la **señal completa** de /cripto-senal (historial
real, filtro de BTC, ballenas, Fear & Greed, simulación): la columna `SEÑAL` es lo que dirá la
señal. Así el escáner no recomienda una moneda que la señal luego rechaza.

**Apto**: el ATR de 5m tiene que ser al menos 4.5 veces la
comisión de ida y vuelta, y el spread menor que 0.05 %. Si no, el movimiento no
paga las comisiones.

## Pasos

1. Ejecuta el escáner.
2. La columna `reversión` indica la dirección y la confianza de un rebote hacia
   la media si el precio está estirado. En mercado lateral suele ser la mejor
   opción; la señal completa decide con el historial real.
3. Prioriza las que tienen `SEÑAL: LONG/SHORT`. Una moneda con confianza alta en el filtro
   rápido pero `SEÑAL: NO OPERAR` no se recomienda: di por qué (el motivo sale en el JSON).
   Muestra 3 a 5 monedas **aptas** que no estén `lateral` ni `extendido`, y da
   preferencia a las de **0 promo** (sin comisión), porque en operaciones cortas la
   comisión es la mitad de la batalla.
4. Si BTC está claramente en una dirección, casi todo saldrá en la misma: es
   el mercado, no 15 oportunidades distintas.
5. Ofrece la señal completa de la elegida: `/cripto-senal MONEDA --capital X`
   (con `--comision 0` si confirmó en la app que no paga comisión). El escáner
   no calcula la entrada ni el SL, ni mira el historial real: eso lo hace la
   señal.
