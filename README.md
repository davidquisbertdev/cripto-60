# Cripto Trader skill

Skills de Claude para operar **futuros perpetuos de criptomonedas en MEXC** de
forma manual: le pides una señal ("analiza SOL, tengo 10 USDT") y te dice si es
**LONG, SHORT o NO OPERAR**, con entrada, stop loss, **TP1, TP2 y TP3**, qué %
cerrar en cada uno, apalancamiento, margen, cuánto ganas o pierdes en USDT, las
probabilidades y **cuánto tiempo esperar como máximo** antes de cerrar.

La idea no es hacerse millonario de la noche a la mañana, sino hacer crecer el
capital poco a poco con una gestión de riesgo estricta. Las operaciones las
haces tú en MEXC: nada de esto toca tu cuenta.

Las herramientas son Node.js (18 o superior) sin dependencias y leen datos
públicos sin API key: la API de futuros de MEXC, los RSS de Cointelegraph,
Decrypt y CoinDesk, y el índice Fear & Greed de alternative.me.

## Las skills

| comando | qué hace |
| --- | --- |
| `/cripto-senal` | Analiza una moneda (5m, 15m, 1h, 4h, BTC, funding, libro de órdenes, noticias) y da la orden completa, o NO OPERAR con los niveles a vigilar. |
| `/cripto-posicion` | Revisa tu posición abierta: MANTENER, MOVER SL, REDUCIR o CERRAR, según el precio, el tiempo, las noticias nuevas y si el análisis cambió. |
| `/cripto-noticias` | Titulares recientes de la moneda y del mercado, sentimiento, alertas de riesgo y Fear & Greed. |
| `/cripto-escaner` | Ordena los futuros cripto más líquidos de MEXC por claridad del setup. |
| `/cripto-diario` | Registra tus resultados, lleva el capital y para la operativa si el día va mal. |

## Ejemplos

```
analiza SOL para un trade, tengo 10 USDT, quiero sacar unos 3$
```

Claude ejecuta `/cripto-senal SOL --capital 10 --objetivo 3` y responde algo así
(datos reales del 7/11/2026):

```
SEÑAL: SHORT   confianza MEDIA (69/100)
  Entrada    89.47 a mercado, o limit 89.50
  Stop loss  89.97  (+0.56 %)
  TP1        88.97  cierra 50 % → +0.24 USDT
  TP2        88.47  cierra 30 % → +0.30 USDT
  TP3        87.97  cierra 20 % → +0.15 USDT
  Apalancamiento 12x AISLADO · margen 6.71 USDT · 9 contratos (0.9 SOL)
  Si salta el SL pierdes -0.48 USDT = 4.8 % del capital
  Objetivo: sacar 3 USDT exigiría arriesgar 19 % del capital, por encima de tu tope de 10 %.
PROBABILIDADES  TP1 52 % · TP2 28 % · TP3 14 % · SL antes del TP1 47 %
  Espera máxima: 1 h. Si a las 12:57 no tocó TP1, cierra la posición.
```

```
otro día: tengo 100 USDT, analiza MNT
```

→ **NO OPERAR**: el 4h es bajista, el 1h y el 15m alcistas y BTC va en contra.
Te da el plan de referencia (usando como mucho la mitad del capital) y los
niveles que tendrían que romperse para volver a mirar.

```
analiza mi posición de SOL        (5 minutos después)
```

→ Lee la señal guardada, mira las velas de 1 minuto desde tu entrada, las
noticias publicadas desde entonces y el análisis actualizado: `MANTENER`,
`MOVER SL a entrada`, `REDUCIR`, `CERRAR (se acabó el tiempo)` o `CERRAR (el
análisis cambió)`.

## Gestión de riesgo

- **El riesgo depende de la confianza**: ALTA 8 %, MEDIA 5 % y BAJA 2,5 % del
  capital si salta el SL, con un tope del 10 %. El margen también: ALTA 100 %,
  MEDIA 70 % y BAJA 50 % del capital.
- **El apalancamiento se calcula**, con un tope de 20x, y la liquidación queda
  siempre al menos al doble de distancia que el SL. Margen **aislado**.
- **TP1, TP2 y TP3 a 1R, 2R y 3R**, cerrando el 50 %, el 30 % y el 20 %. Al
  tocar el TP1, el SL pasa a la entrada; al tocar el TP2, el SL pasa al TP1.
- **Espera máxima**: si el TP1 no llega en el tiempo que tarda el 75 % de las
  simulaciones ganadoras, se cierra.
- **Diario**: tras 2 pérdidas seguidas, el riesgo baja a la mitad. Con 3
  pérdidas seguidas, un 15 % perdido en el día o 4 operaciones, se para hasta
  el día siguiente.
- Se incluyen las comisiones reales de cada contrato en MEXC (por ejemplo, SOL:
  maker 0 % y taker 0,02 %).

Todo se puede cambiar en `trader/config.json` (copia `config.example.json`).

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
Las probabilidades salen de una simulación construida con las velas de 5
minutos de los últimos ~3,5 días de la moneda. El futuro puede hacer cosas que
esos días no hicieron (noticias, cascadas de liquidaciones).

**Un stop es un plan, no una garantía**: en un movimiento brusco puede
ejecutarse peor.

**Datos gratuitos**: la API pública de MEXC y los RSS pueden fallar o retrasarse.
Comprueba el precio en MEXC antes de entrar.

Basado en [day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill)
(MIT), reescrito para futuros cripto.
