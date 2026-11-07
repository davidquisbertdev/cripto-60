---
name: cripto-senal
description: >-
  Señal de trading para futuros perpetuos de criptomonedas en MEXC. Analiza una
  moneda en 5m, 15m, 1h y 4h (tendencia, momentum, RSI, ADX, ATR, soportes y
  resistencias), más BTC, funding, libro de órdenes, noticias y Fear & Greed, y
  responde LONG, SHORT o NO OPERAR con entrada, stop loss, TP1/TP2/TP3, qué % de
  la posición cerrar en cada TP, apalancamiento, margen a usar según la
  confianza, precio de liquidación, ganancia/pérdida en USDT, probabilidades
  (Monte Carlo con las velas reales de la moneda) y el tiempo máximo para esperar
  el TP1 antes de cerrar. Úsala cuando el usuario diga "analiza SOL", "dame
  entrada para BTC", "señal de ETH", "long o short en MNT", "tengo 10 USDT,
  quiero sacar 3$", "qué hago con XRP", "¿entro en DOGE?".
argument-hint: "MONEDA --capital USDT [--objetivo USDT]"
---

# cripto-senal

Esta es la skill principal. El usuario opera **a mano** futuros perpetuos USDT en
**MEXC** y quiere crecer el capital poco a poco, sin apuestas grandes. Tú
analizas y le dices exactamente qué poner en la orden. Nunca colocas órdenes.

`${CLAUDE_SKILL_DIR}` es la carpeta de esta skill. Las herramientas son Node.js
(versión 18 o superior) sin dependencias y leen la API pública de MEXC, sin API key.

```bash
node "${CLAUDE_SKILL_DIR}/senal.mjs" SOL --capital 10                 # señal completa
node "${CLAUDE_SKILL_DIR}/senal.mjs" SOL --capital 10 --objetivo 3    # ¿se pueden sacar 3 USDT?
node "${CLAUDE_SKILL_DIR}/senal.mjs" MNT --capital 100 --json         # todo en JSON
node "${CLAUDE_SKILL_DIR}/senal.mjs" ETH --capital 50 --lado long     # forzar un lado (baja la confianza si va en contra)
```

Otras opciones: `--sin-noticias`, `--semilla N`, `--simulaciones N`,
`--no-guardar`, `--offline DIR` (datos guardados), `--grabar DIR`.
Si el usuario no dice cuánto capital tiene y existe `trader/diario.json`, se usa
el capital del diario. Si no, pregúntale cuánto tiene disponible.

## Pasos

1. Saca la moneda y el capital del mensaje ("analiza SOL, tengo 10 usdt" →
   `SOL --capital 10`). Si menciona una ganancia deseada ("para sacar 3$"),
   pásala como `--objetivo 3`.
2. Ejecuta `senal.mjs`. Se guarda en `trader/senal-<MONEDA>.json`, que
   `/cripto-posicion` lee después.
3. Si tienes WebSearch, busca noticias de la última hora de la moneda
   ("<nombre> crypto news today"). Si hay algo fuerte que el RSS no tenga (hack,
   deslistado, desbloqueo de tokens, demanda, evento macro en minutos como el
   CPI o la Fed), dilo y baja la recomendación: de ALTA a MEDIA o de MEDIA a NO
   OPERAR.
4. Responde en español, corto y claro, con este orden:
   - **Veredicto**: LONG / SHORT / NO OPERAR y la confianza (ALTA, MEDIA, BAJA),
     con 2 o 3 razones en lenguaje simple.
   - **La orden para MEXC**: dirección, entrada (a mercado o el limit), margen
     aislado, apalancamiento, número de contratos (y su equivalente en monedas),
     stop loss, y TP1, TP2 y TP3 con el % a cerrar en cada uno.
   - **Dinero**: cuánto pierde si salta el SL y cuánto gana en cada TP, en USDT.
   - **Probabilidades** de la simulación: TP1, TP2, TP3 y SL antes del TP1.
   - **Tiempo**: la hora límite para entrar y la **espera máxima**: "si a las
     HH:MM no tocó el TP1, cierra".
   - Gestión: al tocar el TP1, SL a la entrada; al tocar el TP2, SL al TP1.
5. Si el usuario dio un objetivo, di claramente si es realista, usando la
   línea "Objetivo". Si no lo es, dilo sin rodeos y da la cifra realista. No
   subas el riesgo para alcanzarlo.
6. Si sale **NO OPERAR**, no des la orden como recomendación. Explica por qué
   (marcos en conflicto, mercado lateral, simulación negativa, límite del
   diario) y da los niveles de "QUÉ ESPERAR". Puedes mencionar el plan de
   referencia solo si el usuario insiste, avisando de que no está recomendado.
7. Recuérdale que puede pedir "analiza mi posición de SOL" en unos minutos.

## Cómo decide

- **Puntuación** de -1 a +1: tendencia (precio y EMA20/50/200, pendiente) y
  momentum (MACD, RSI) en cada marco, con pesos 4h 30 %, 1h 35 %, 15m 25 % y
  5m 10 %. BTC cuenta un 15 % (salvo para BTC), y el funding extremo, el
  libro de órdenes y el sentimiento de las noticias la ajustan.
- **Confianza** de 0 a 100: fuerza de la puntuación y acuerdo entre marcos. Se
  descuenta si el ADX de 1h indica mercado lateral (entonces el máximo es
  MEDIA), si el precio está sobreextendido, si el RSI de 5m dice que el
  movimiento ya corrió, o si hay una noticia de riesgo. Por debajo de 40, o con
  una puntuación débil: NO OPERAR. **La confianza no es una probabilidad**: es
  cuánto coinciden los indicadores.
- **SL**: detrás del soporte o la resistencia de 15m más cercanos, más 0.25 ATR,
  entre 0.8 y 2.5 ATR(15m). **TPs** a 1R, 2R y 3R. Se cierra el 50 %, el 30 % y
  el 20 % (configurable).
- **Tamaño**: el riesgo depende de la confianza: ALTA 8 %, MEDIA 5 % y BAJA
  2.5 % del capital, con un tope del 10 %. El margen también: ALTA 100 %, MEDIA
  70 % y BAJA 50 % del capital (así, con 100 USDT e incertidumbre, usa unos
  50). El apalancamiento sale de ahí, con un tope de 20x y siempre dejando la
  liquidación al menos al doble de distancia que el SL. Las comisiones taker de
  MEXC de ese contrato están incluidas.
- **Probabilidades**: 5000 simulaciones de las próximas 12 h sorteando velas
  reales de 5m de los últimos ~3.5 días de esa moneda (su volatilidad y su
  deriva), con la gestión del plan. Si una vela toca el SL y un TP, cuenta
  como SL. Si el resultado esperado es negativo, la confianza baja o pasa a
  NO OPERAR.
- **Espera máxima**: el tiempo en que el 75 % de las simulaciones que
  llegaron al TP1 ya lo habían tocado (mínimo 15 min). Pasado ese tiempo sin
  TP1, la probabilidad juega en contra: se cierra.
- **Diario**: si `trader/diario.json` dice que hoy se alcanzó el límite de
  pérdida, de operaciones o de pérdidas seguidas, sale NO OPERAR. Tras 2
  pérdidas seguidas, el riesgo baja a la mitad.

## Reglas

- Solo criptomonedas: MEXC también lista acciones, metales y forex como
  perpetuos, y la herramienta los rechaza.
- Siempre margen **aislado**, nunca cruzado.
- No prometas ganancias. Di una vez, sin sermones, que es un cálculo y no
  asesoría, y que los futuros apalancados pueden liquidarse.
- Si los datos fallan, dilo. Nunca inventes precios ni niveles.
