---
name: cripto-senal
description: >-
  Señal INTRADÍA CORTA para futuros perpetuos de criptomonedas (datos de Binance por defecto, o MEXC)
  (operaciones de 15 a 60 minutos, con objetivo de ganancia en USDT). Analiza una moneda en 1m, 5m
  y 15m (más 1h de contexto): tendencia, momentum, RSI, ADX, ATR, swings,
  SIEMPRE Bitcoin (lectura, correlación y si acompaña o va en contra),
  funding, libro, noticias y ballenas. Responde LONG, SHORT o NO OPERAR con
  entrada (limit o mercado), stop loss con espacio calibrado por tiempo,
  TP1/TP2/TP3 (cierra 50 %, 75 %, 100 %), APALANCAMIENTO calculado para el
  objetivo (p. ej. 3 USDT) con los frenos de pérdida máxima y liquidación,
  margen según la confianza, ganancia/pérdida en USDT, probabilidades en 1 h, el HISTORIAL
  REAL de la misma señal en las últimas ~28 h (con comisiones), la espera
  máxima del TP1 y la hora de cierre total. Evalúa dos estrategias, TENDENCIA (a
  favor del movimiento) y REVERSIÓN a la media (precio estirado, apuesta a la
  vuelta), y recomienda la que gana ahora en esa moneda según su historial real. Úsala cuando el usuario diga
  "analiza SOL", "dame entrada para BTC", "scalp en ETH", "long o short en
  MNT", "tengo 10 USDT", "siguiente operación", "¿entro en DOGE?".
argument-hint: "MONEDA --capital USDT [--margen USDT] [--objetivo USDT] [--comision 0] [--estrategia tendencia|reversion]"
---

# cripto-senal (intradía 15-60 min)

El usuario opera a mano operaciones de **15 a 60 minutos**, buscando
**unos 3 USDT por operación** con 15-20 USDT de margen (más adelante, más margen
con las ganancias). Quiere un SL con espacio, que un pequeño retroceso no lo
saque. Tú analizas y le dices
exactamente qué poner en la orden. Nunca colocas órdenes.

`${CLAUDE_SKILL_DIR}` es la carpeta de esta skill. Las herramientas son Node.js
(versión 18 o superior) sin dependencias y no necesitan API key.

```bash
node "${CLAUDE_SKILL_DIR}/senal.mjs" SOL --capital 10                 # señal completa
node "${CLAUDE_SKILL_DIR}/senal.mjs" SOL --capital 20 --margen 15    # 20 en la cuenta, 15 en esta operación
node "${CLAUDE_SKILL_DIR}/senal.mjs" SOL --capital 20 --objetivo 5    # otro objetivo (por defecto 3 USDT; 0 = sin objetivo)
node "${CLAUDE_SKILL_DIR}/senal.mjs" ENA --capital 10 --comision 0    # moneda con 0 comisión confirmada en la app
node "${CLAUDE_SKILL_DIR}/senal.mjs" ETH --capital 50 --lado long     # forzar un lado (baja la confianza si va en contra)
node "${CLAUDE_SKILL_DIR}/senal.mjs" SOL --capital 10 --sin-ballenas  # más rápido (unos 3 s en lugar de 12)
node "${CLAUDE_SKILL_DIR}/senal.mjs" SOL --capital 10 --estrategia reversion   # solo una estrategia
node "${CLAUDE_SKILL_DIR}/senal.mjs" SOL --capital 10 --exchange mexc   # datos y comisiones de MEXC en lugar de Binance
```

**Exchange**: por defecto los datos salen de **Binance** futuros USDⓈ-M (el de
más liquidez: el libro más profundo y el precio de referencia del mercado). Con
`--exchange mexc`, o con `"exchange": "MEXC"` en `trader/config.json`, se usa
MEXC. En Binance:
- Comisiones estándar VIP 0: maker 0.02 % y taker 0.05 % (sin descuento de
  BNB). Si tu cuenta tiene otras, usa `--comision`.
- El tamaño se da en **monedas** ("Cantidad 119 NEAR"), no en contratos.
- La API pública no da los tramos de apalancamiento: el plan topa en 30x, pero
  recuerda al usuario que confirme en la app el apalancamiento máximo de la
  moneda y la liquidación.

Otras opciones: `--json`, `--sin-noticias`, `--semilla N`, `--no-guardar`,
`--offline DIR`, `--grabar DIR`. Si el usuario no dice el capital y existe
`trader/diario.json`, se usa el capital del diario.

## Pasos

1. Saca la moneda y el capital del mensaje ("analiza SOL, tengo 10 usdt" →
   `SOL --capital 10`). Si dice cuánto pone en la operación, `--margen`. Si dice
   cuánto quiere ganar, `--objetivo` (por defecto 3 USDT). Si existe el diario,
   el capital y el margen sugerido salen de ahí.
2. Ejecuta `senal.mjs`. Se guarda en `trader/senal-<MONEDA>.json` para
   `/cripto-posicion`.
3. Solo si hay una noticia de última hora que pueda mover el precio en minutos
   (hack, deslistado, CPI o Fed en los próximos 30 min), búscala con WebSearch
   si está disponible y dila. En operaciones de minutos, las noticias viejas no importan.
4. Responde en español y corto:
   - **Veredicto**: LONG / SHORT / NO OPERAR y la confianza, con 2 razones.
   - **Bitcoin (siempre)**: la línea BITCOIN del informe: lectura de BTC
     (ALCISTA, BAJISTA o NEUTRAL), su tendencia mayor 15m + 1h si sale, cuánto
     sigue la moneda a BTC (correlación y beta) y si BTC está A FAVOR o EN
     CONTRA de la operación. Las altcoins siguen a BTC: si va en contra, dilo
     primero.
   - **La orden**: entrada limit (o mercado), margen aislado, **apalancamiento
     y por qué** (la línea bajo APALANCAMIENTO), contratos, SL, y TP1 (cierra
     50 %), TP2 (75 %) y TP3 (100 %).
   - **Dinero**: la pérdida si salta el SL, la ganancia si llegan los 3 TP y la
     ganancia si solo llega el TP1. Si el objetivo no se alcanza, di cuánto sí y
     qué lo frena (pérdida máxima o liquidación).
   - **Tiempo**: "entra antes de las HH:MM; si a las HH:MM no tocó el TP1,
     cierra; a las HH:MM cierra todo".
   - **Historial real**: % de ganadoras y resultado medio de la misma señal en
     las últimas horas. Es el dato más honesto: si es negativo, dilo.
5. Si sale **NO OPERAR**, dilo sin rodeos y por qué: historial negativo, mercado
   quieto o lateral, comisiones que se comen el movimiento, pausa del diario.
   Sugiere probar otra moneda (`/cripto-escaner`) o volver en unos minutos.
6. Sé claro con la relación ganancia/pérdida: para ganar unos 3 USDT con 20 de
   margen se pierden unos 1.4-2 USDT si salta el SL. Nunca subas el riesgo por
   encima del tope para llegar al objetivo.

## Dos estrategias, elige la que está ganando

- **TENDENCIA**: entra a favor del movimiento cuando 5m, 1m y 15m coinciden.
  Funciona cuando el mercado tiene dirección.
- **REVERSIÓN a la media**: entra contra un estiramiento, con el precio lejos de
  su media de 5m (bandas de Bollinger 20,2, en desviaciones `z`) y el RSI de 5m
  extremo, apostando a la vuelta. Suma si hay una vela de giro en 1m y si el
  mercado está lateral; resta contra una tendencia fuerte de 15m, ante un
  movimiento violento (|z| ≥ 3.2) o con las ballenas en contra. Solo se
  evalúa si hay estiramiento (puntuación de 0.35 o más).
- Cada una se calibra (SL por tiempo) y se mide con **su propio historial real**
  en la moneda y el lado. Se recomienda la que no es NO OPERAR y tiene mejor
  historial. La otra aparece como "La otra estrategia".
- Di siempre qué estrategia es. En una reversión explica que se busca la vuelta
  hacia la media (el precio aparece en el informe) y que va contra el
  movimiento corto, así que es normal que el análisis de tendencia diga lo
  contrario.

## Cómo decide

- **Puntuación** de -1 a +1 por marco (tendencia con EMAs y pendiente,
  momentum con MACD y RSI), con pesos 5m 35 %, 1m 25 %, 15m 25 % y 1h 15 %.
  **BTC siempre se revisa** (1m, 5m, 15m y 1h, ver `/cripto-btc`) y pesa
  10 % + 20 % × la correlación de la moneda con BTC (con 0.7, un 24 %). El
  funding extremo, el libro, las noticias y las **ballenas** (15 %, con
  prioridad al flujo de los últimos 15 min) la ajustan.
- **Filtro de BTC** (moneda con correlación ≥ 0.5): una **reversión** contra
  BTC, con BTC fuerte, moviéndose ahora o con su tendencia 15m + 1h en contra,
  sale **NO OPERAR**. Si no, -15 de confianza. En **tendencia**, BTC en contra
  resta 10 y, si es fuerte, baja un nivel. BTC a favor suma 5.
- **Confianza** de 0 a 100: fuerza de la puntuación y acuerdo entre marcos. Se
  descuenta si el ADX de 15m indica mercado lateral (entonces el máximo es
  MEDIA), si el precio está sobreextendido, si el RSI de 1m dice que el impulso
  ya corrió, si las ballenas van en contra o si el volumen de 5m es muy bajo.
- **SL con espacio, calibrado por tiempo**: se prueban 0.9, 1.2, 1.6 y 2.0
  ATR(5m), más la estructura del swing de 5m. Cada uno pasa por 2000 simulaciones con velas
  reales de 1 min, aplicando la regla de cerrar si no hay TP1 en 30 min. Se
  elige **el más amplio** con el que al menos el 65 % de los casos se resuelve
  (TP1 o SL) dentro de la espera: así la operación dura minutos y el ruido no
  la barre. El mínimo es 0.3 %. Si el 60 % o más se cierra por tiempo, NO
  OPERAR: el precio no se mueve lo suficiente.
- **TPs** a 1R, 1.8R y 2.6R: TP1 cierra el 50 %, TP2 otro 25 % (75 %) y TP3
  el resto (100 %). Tras el TP1, SL a la entrada; tras el TP2, SL al TP1.
- **Comisiones**: el TP1 tiene que cubrir al menos 3 veces la comisión de ida y
  vuelta del contrato; si no, NO OPERAR. Se usa la comisión de la ficha del
  contrato (MEXC) o la estándar de Binance. Si MEXC tiene una promoción de 0
  comisión y la confirmaste, usa `--comision 0`.
- **Apalancamiento (la lógica del usuario)**: con el SL más cerca se puede usar
  más apalancamiento con la misma pérdida en USDT, y con menos margen hace falta
  más apalancamiento para el mismo objetivo. El cálculo:
  1. posición necesaria = objetivo / (movimiento medio de los TP con el reparto
     50/25/25, menos comisiones);
  2. frenos: la pérdida en el SL no puede pasar del % del capital según la
     confianza (ALTA 10 %, MEDIA 7 %, BAJA 4 %); la liquidación tiene que quedar
     al menos al doble de distancia que el SL; y el tope es de 30x;
  3. apalancamiento = posición / margen usado (ALTA 100 %, MEDIA 75 %, BAJA 50 %
     del margen elegido).
  Si un freno impide el objetivo, el informe dice cuánto se gana de verdad y
  qué haría falta (más margen o más riesgo).
- **Probabilidades** (Monte Carlo): sortea velas reales de 1 min, así que
  **mide tiempos y distancias, no la ventaja**.
- **Historial real**: en las últimas ~28 h, cada vez que el análisis rápido (5m
  + 1m) dio la misma dirección con fuerza, aplica el mismo plan sobre lo que
  pasó de verdad, con comisiones. Con 12 o más operaciones: por debajo de -0.03 R,
  NO OPERAR (nunca se recomienda algo que pierde en promedio); entre -0.03 y
  +0.03 R, baja la confianza. Con menos de 12, baja un nivel. **Esto mide si la
  señal tiene ventaja ahora en esa moneda.**
- **El historial también aplica el filtro de BTC**: en cada operación pasada
  se lee BTC tal como estaba en ese momento y se quitan las que el filtro
  habría bloqueado. Las quitadas se miden aparte (línea "Filtro BTC en el
  historial": cuántas evitó, su resultado y si el filtro AYUDA o NO ayuda en
  esa moneda). Si el historial filtrado tiene menos de 12 operaciones, se juzga
  con el completo, para que el filtro nunca esconda un historial que pierde.
  Si la señal de ahora está bloqueada por BTC pero las operaciones que el
  filtro evitó vienen ganando (12 o más y +0.03 R o más), el bloqueo se levanta
  y solo baja un nivel. Dile al usuario qué dice esa línea.
- **Tiempos**: la entrada caduca en 5 min. Espera del TP1: el p75 de las
  simulaciones, entre 10 y 30 min. Cierre total a los 60 min.
- **Alertas de corto plazo**: funding a punto de cobrarse (10 min o menos), spread
  ancho, volumen de 5m bajo.
- **Diario**: con una pérdida diaria del 20 %, 4 pérdidas seguidas, la pausa de
  30 min tras 2 pérdidas seguidas o más de 4 operaciones por hora sale NO
  OPERAR. Tras 2 pérdidas seguidas, el riesgo baja a la mitad. El margen
  sugerido crece con las ganancias.

## Reglas

- Solo criptomonedas: los contratos de acciones, metales y forex se rechazan.
- Siempre margen **aislado**. Mejor entrar con **limit**: la comisión maker es
  menor o nula.
- No prometas ganancias. En el trading de corto plazo, la mayoría pierde por las comisiones y
  por hacer demasiadas operaciones. Dilo una vez, sin sermones.
- Si los datos fallan, dilo. Nunca inventes precios ni niveles.
