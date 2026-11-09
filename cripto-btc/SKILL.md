---
name: cripto-btc
description: >-
  Lectura de Bitcoin como guía de las altcoins: qué hace BTC ahora en 1m, 5m,
  15m y 1h (ALCISTA, BAJISTA o NEUTRAL y su fuerza), si se está moviendo con
  fuerza en este momento, sus niveles de 5m y, si se indica una altcoin, cuánto
  la arrastra (correlación y beta de 5m) y si BTC acompaña o va en contra de un
  LONG o un SHORT en ella. /cripto-senal y /cripto-posicion ya lo incluyen y
  bloquean una reversión contra un BTC con dirección. Úsala cuando el usuario
  diga "¿qué hace BTC?", "¿cómo está Bitcoin?", "¿BTC acompaña a SOL?",
  "¿el mercado sube o baja?", "¿BTC arrastra a las alts?", o antes de operar
  cualquier altcoin.
argument-hint: "[MONEDA]"
---

# cripto-btc (Bitcoin manda en el corto plazo)

En operaciones de 15 a 60 minutos, las altcoins siguen a BTC: cuando BTC cae
con fuerza, casi todas caen con él, aunque su gráfico propio diga lo contrario.

```bash
node "${CLAUDE_SKILL_DIR}/btc.mjs"          # solo BTC
node "${CLAUDE_SKILL_DIR}/btc.mjs" SOL      # BTC y su relación con SOL (correlación, beta, LONG/SHORT)
node "${CLAUDE_SKILL_DIR}/btc.mjs" SOL --json
```

## Cómo lee BTC

- **Puntuación** de -1 a +1 con los marcos 1m 15 %, 5m 35 %, 15m 30 % y 1h
  20 % (tendencia con EMAs y momentum con MACD y RSI). Si las tres últimas
  velas de 5m van en la misma dirección y el movimiento de 15 min es mayor que
  su ATR, hay **presión ahora** y se suma ±0.1.
- **Lectura**: ALCISTA (≥ 0.25), BAJISTA (≤ -0.25) o NEUTRAL; fuerte si
  |puntuación| ≥ 0.5.
- **Relación con la altcoin**: correlación y beta de los retornos de 5m de las
  últimas ~8 h. El peso de BTC en la señal de la altcoin es 10 % + 20 % ×
  correlación (con 0.8, un 26 %).

## Cómo afecta a la señal (/cripto-senal y /cripto-posicion)

Con la moneda ligada a BTC (correlación ≥ 0.5) y BTC en contra (|p| ≥ 0.25):

- **Reversión** contra BTC con |p| ≥ 0.4 o con presión ahora: **NO OPERAR**
  (es atrapar un cuchillo que cae). Si no, -15 de confianza.
- **Tendencia** contra BTC: -10 de confianza; con |p| ≥ 0.4 o con presión
  ahora, además baja un nivel.
- BTC a favor: +5 de confianza (nunca sube el nivel).
- Con una posición abierta, BTC empujando en contra lleva a **REDUCIR**.

## Cómo responder

En español y corto: la lectura de BTC con la razón (marcos, cambio de 15 min y
1 h, si hay presión ahora), y si se pidió una moneda, su correlación, cuánto se
mueve por cada 1 % de BTC y si BTC acompaña un LONG o un SHORT. Si BTC está
NEUTRAL y lateral, dilo: la altcoin se mueve por su cuenta y pesa más su propio
análisis. No es asesoría financiera.

## En el historial de la señal

El historial de ~28 h de `/cripto-senal` lee BTC tal como estaba en cada
operación pasada y quita las que el filtro habría bloqueado; las mide aparte
para decir si el filtro AYUDA o NO ayuda ahora en esa moneda. Si las evitadas
vienen ganando, el bloqueo se levanta (solo baja un nivel).

Por defecto los datos salen de Binance (`--exchange bybit` para Bybit, `--exchange mexc` para MEXC).
