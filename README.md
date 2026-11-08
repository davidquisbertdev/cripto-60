# Cripto Trader skill

Skills de Claude para operar **futuros perpetuos de criptomonedas** (datos de **Binance** por defecto, o MEXC con `--exchange mexc`) de
forma manual, en operaciones de **15 a 60 minutos** que buscan unos **3 USDT**
cada una: le pides una señal ("analiza SOL, tengo 10 USDT") y te dice si es
**LONG, SHORT o NO OPERAR**, con entrada, stop loss, **TP1, TP2 y TP3**, qué %
cerrar en cada uno, apalancamiento, margen, cuánto ganas o pierdes en USDT, las
probabilidades y **cuánto tiempo esperar como máximo** antes de cerrar.

La idea no es hacerse millonario de la noche a la mañana, sino hacer crecer el
capital poco a poco con una gestión de riesgo estricta. Las operaciones las
haces tú en tu exchange: nada de esto toca tu cuenta.

Las herramientas son Node.js (18 o superior) sin dependencias y leen datos
públicos sin API key: la API de futuros USDⓈ-M de Binance (o la de MEXC); las posiciones on-chain de las
ballenas de Hyperliquid; los ratios de top traders y el open interest de
Binance (o Bybit); los RSS de Cointelegraph, Decrypt y CoinDesk, y el índice
Fear & Greed de alternative.me.

## Las skills

| comando | qué hace |
| --- | --- |
| `/cripto-senal` | Analiza una moneda (1m, 5m, 15m, 1h, siempre con BTC de guía, funding, libro de órdenes, noticias) y da la orden completa, o NO OPERAR con los niveles a vigilar. |
| `/cripto-btc` | Qué hace Bitcoin (1m, 5m, 15m, 1h y tendencia mayor) y cuánto arrastra a una altcoin (correlación y beta). La señal y la revisión de posición lo usan siempre: una reversión contra BTC sale NO OPERAR. |
| `/cripto-posicion` | Revisa tu posición abierta: MANTENER, MOVER SL, REDUCIR o CERRAR, según el precio, el tiempo, las noticias nuevas y si el análisis cambió. |
| `/cripto-ballenas` | Qué hacen las ballenas: posiciones reales de las billeteras grandes de Hyperliquid, qué abrieron o cerraron, qué cambió desde la última revisión, top traders frente a minoristas, open interest, flujo y muros. Lo usan también la señal y la revisión de posición. |
| `/cripto-noticias` | Titulares recientes de la moneda y del mercado, sentimiento, alertas de riesgo y Fear & Greed. |
| `/cripto-escaner` | Ordena los futuros cripto más líquidos (Binance o MEXC) por claridad del setup. |
| `/cripto-diario` | Registra tus resultados, lleva el capital y para la operativa si el día va mal. |

## Ejemplos

```
analiza ENA, tengo 20 USDT
```

Claude ejecuta `/cripto-senal NEAR --capital 10` (datos reales del 7/11/2026):

```
SEÑAL: SHORT   confianza BAJA
  Entrada    limit 3.660 o a mercado 3.658 · si a las 12:37 no entraste, descártala
  Stop loss  3.667  (+0.25 %)  0.7 ATR(5m), calibrado por tiempo
  TP1        3.649  cierra 50 % → +0.10 USDT
  TP2        3.644  cierra 30 % → +0.09 USDT
  TP3        3.639  cierra 20 % → +0.07 USDT
  Apalancamiento 13x AISLADO · margen 6.47 USDT · 23 contratos
  Si salta el SL pierdes -0.24 USDT = 2.4 % del capital
PROBABILIDADES en 25 min: TP1 37 % · SL 38 % · cierre por tiempo 25 %
HISTORIAL REAL (últimas 27 h, 54 operaciones con el mismo plan, con comisiones)
  ganadoras 52 % · resultado medio -0.07 R → 10 operaciones ≈ -0.16 USDT
TIEMPO  TP1 suele llegar en 7 min. Si a las 12:44 no tocó TP1, CIERRA.
        Si tocó TP1, cierra todo como mucho a las 12:59.
```

La señal evalúa **dos estrategias**: TENDENCIA (a favor del movimiento) y
REVERSIÓN a la media (cuando el precio se estira lejos de su media de 5m, se
apuesta a la vuelta). Mide el historial real de cada una en esa moneda y
recomienda la que está ganando. En mercado lateral suele ganar la reversión; con
tendencia, la tendencia.

El historial real es la parte más importante: dice si esta señal **ganó o
perdió de verdad** en esa moneda durante las últimas horas, comisiones
incluidas. Si pierde, la herramienta baja la confianza o dice NO OPERAR.

```
analiza mi posición de NEAR        (4 minutos después)
```

→ `MANTENER` (te quedan 6 min para el TP1), `MOVER SL a entrada`, `REDUCIR`,
`CERRAR (se acabó el tiempo)` o `CERRAR (el análisis cambió)`.

```
¿qué moneda opero ahora?
```

→ `/cripto-escaner`: las monedas que más se mueven frente a sus comisiones,
marcando, en MEXC, las que tienen **0 comisión**.

## Gestión de riesgo

- **SL con espacio**: entre 0.3 % y 0.8 % (de 0.9 a 2 ATR de 5m), elegido para que
  la operación se resuelva en 15 a 30 min y un pequeño retroceso no te saque.
- **TPs a 1R, 1.8R y 2.6R**: el TP1 cierra el 50 %, el TP2 el 75 % y el TP3 el
  100 %. Tras el TP1, SL a la entrada.
- **Apalancamiento calculado para tu objetivo** (3 USDT por defecto):
  posición = objetivo / movimiento medio de los TP; apalancamiento = posición /
  margen. **Menos margen o un SL más cerca = más apalancamiento** para la misma
  ganancia. Ejemplo real: con 20 USDT hicieron falta 22x en ENA; con 100 USDT
  en MNT bastaron 10x.
- **Frenos que el objetivo nunca rompe**: la pérdida en el SL no pasa del 10 % /
  7 % / 4 % del capital (confianza ALTA / MEDIA / BAJA); la liquidación queda
  siempre al menos al doble de distancia que el SL; el tope es de 30x. Si no
  llegas a 3 USDT, el informe te dice cuánto y por qué.
- **La cara B, siempre visible**: para ganar unos 3 USDT con 20 de margen, si salta
  el SL pierdes unos 1.4-2 USDT.
- **Reloj**: la entrada caduca en 5 min; sin TP1 en 10 a 30 min, se cierra; a los
  60 min se cierra todo.
- **Diario**: con 2 pérdidas seguidas, pausa de 30 min y riesgo a la mitad; con 4,
  o un 20 % perdido en el día, se para hasta mañana. **Margen sugerido** = 20 +
  50 % de lo ganado: el tamaño crece con tus ganancias.
- **Solo se recomienda lo que gana en el historial real reciente** de esa moneda
  (con comisiones). Si pierde en promedio: NO OPERAR.

Todo se configura en `trader/config.json` (copia `config.example.json`).

## Instalación

Como plugin de Claude Code:

```
/plugin marketplace add <tu-usuario>/daily-trader-skill
/plugin install cripto-trader-skill@cripto-trader-skill
```

O copiando las carpetas, **incluida `lib/`**, que comparten todas:

```bash
cp -r cripto-* lib ~/.claude/skills/
```

Los datos se guardan en `trader/`, en la carpeta donde trabajes:
`senal-SOL.json`, `diario.json` y `config.json`.

## Herramientas

```bash
node cripto-senal/senal.mjs SOL --capital 10 --objetivo 3
node cripto-posicion/posicion.mjs SOL --entrada 89.52 --hace 7m
node cripto-ballenas/ballenas.mjs SOL
node cripto-noticias/noticias.mjs SOL MNT --horas 48
node cripto-escaner/escaner.mjs --top 30
node cripto-diario/diario.mjs registrar SOL --pnl 0.68 --lado short
npm test                                  # tests offline con datos reales grabados
```

## Letra pequeña

**No es asesoría financiera.** Es software que lee datos públicos y hace
cálculos. Los futuros apalancados pueden liquidarte, y la mayoría de quienes
hacen trading pierden dinero. Opera solo lo que puedas perder.

**La confianza no es una probabilidad**: mide cuánto coinciden los indicadores.
La simulación (velas reales de 1 min sorteadas) mide tiempos y distancias, no
la ventaja. La ventaja la mide el historial real de las últimas ~28 h, que es
poco tiempo: el mercado cambia y lo que funcionó ayer puede no funcionar hoy.

**El trading de corto plazo es difícil**: las comisiones y el exceso de operaciones hacen que
la mayoría pierda. Si el historial real sale negativo, cree en el historial.

**Un stop es un plan, no una garantía**: en un movimiento brusco puede
ejecutarse peor.

**Datos gratuitos**: las APIs públicas de Binance y MEXC y los RSS pueden fallar o retrasarse.
Comprueba el precio en tu exchange antes de entrar.

Basado en [day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill)
(MIT), reescrito para futuros cripto.
