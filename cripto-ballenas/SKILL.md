---
name: cripto-ballenas
description: >-
  Analiza qué hacen las ballenas y el dinero grande en una criptomoneda: las
  posiciones reales (long o short, tamaño, entrada, apalancamiento,
  liquidación) de las billeteras más grandes y rentables de Hyperliquid (son
  públicas on-chain), qué abrieron o cerraron en las últimas 24 h, qué cambió
  desde la revisión anterior, los top traders de Binance frente a los
  minoristas, el open interest con el precio (longs o shorts nuevos, cierres),
  el flujo agresivo comprador o vendedor, las operaciones grandes y los muros
  del libro del exchange (Binance, Bybit o MEXC). Da una lectura ALCISTA, BAJISTA o NEUTRAL que
  /cripto-senal y /cripto-posicion ya incluyen. Úsala cuando el usuario diga
  "¿qué hacen las ballenas en SOL?", "¿las ballenas están comprando?",
  "¿se están moviendo las ballenas?", "smart money", "billeteras grandes",
  "¿hay muros?", "¿quién está short?", "open interest de BTC".
argument-hint: "MONEDA [--ballenas 50]"
---

# cripto-ballenas

```bash
node "${CLAUDE_SKILL_DIR}/ballenas.mjs" SOL               # lectura completa
node "${CLAUDE_SKILL_DIR}/ballenas.mjs" SOL               # otra vez en 10 min: "DESDE TU REVISIÓN ANTERIOR"
node "${CLAUDE_SKILL_DIR}/ballenas.mjs" BTC --ballenas 100
node "${CLAUDE_SKILL_DIR}/ballenas.mjs" MNT --json
```

Todo es público y gratuito, sin API key. La primera vez descarga la lista de
cuentas de Hyperliquid (unos 40 MB) y la guarda 12 h en `trader/cache/`. Cada
ejecución guarda en `trader/ballenas-<MONEDA>.json` una instantánea con las
posiciones, para comparar en la siguiente.

## Las fuentes y lo que significan

| fuente | qué mide | cómo se lee |
| --- | --- | --- |
| **Hyperliquid: posiciones** (peso 15 %) | posiciones abiertas de las 50 cuentas mayores de 1 M USD, con ganancia histórica y sin rotación de market maker. Se ignoran las posiciones de menos de 25 k USD | neto LONG o SHORT ponderado por tamaño. También muestra la entrada, la liquidación y qué % de la cuenta apuestan (convicción) |
| **Hyperliquid: operaciones 1 h y 4 h** (15 %) | de las 8 mayores: cuánto abrieron o cerraron en long y en short | abrir longs o cerrar shorts es presión compradora, y al revés. Cerrar suele ser tomar ganancia |
| **Top traders frente a minoristas** (10 %) | Binance (velas de 5 min): % en long del 20 % de cuentas con más margen, y de todas las cuentas. Si la moneda no está en Binance: Bybit (solo el total) | ballenas aumentando longs en 30 min es alcista. Minoristas mucho más largos que las ballenas es bajista (barrida probable) |
| **Open interest + precio, 15 min** (20 %) | contratos abiertos | OI y precio suben: longs nuevos. OI sube y el precio baja: shorts nuevos. OI baja: cierres (movimiento débil) |
| **Flujo taker, 15 min** (25 %) | volumen de compra agresiva frente a venta agresiva | quién paga el spread |
| **Exchange: operaciones grandes** (15 %) | operaciones de 25 k USD o más en los últimos minutos | quién empuja ahora mismo |
| **Muros del exchange** | órdenes grandes en el libro a ±3 % del precio | posibles soportes y resistencias. No suman a la puntuación: los muros se pueden retirar |

Los pesos están pensados para operaciones cortas (15-60 min): manda el flujo de los últimos 30 min; las posiciones de fondo de las ballenas cambian despacio y pesan menos. La puntuación va de -1 a +1 y la cobertura indica qué parte de las fuentes
tenía datos. En `/cripto-senal` las ballenas suman un 15 % a la puntuación. Si
van claramente en contra de la señal, restan 10 de confianza y lanzan una
alerta. Si acompañan, suman 5.

## Pasos

1. Ejecuta `ballenas.mjs MONEDA`.
2. Explícalo en simple: quién está posicionado y hacia dónde, si se están
   moviendo (operaciones de 24 h y "desde tu revisión anterior") y si los
   minoristas están del lado contrario.
3. Destaca lo accionable:
   - Una ballena grande con **mucha convicción** (un % alto de su cuenta) y en
     ganancia.
   - **Liquidaciones** de ballenas cerca del precio: si se tocan, pueden
     acelerar el movimiento.
   - Muros cerca del SL o del TP de una señal: sugiere poner el SL detrás del
     muro, no delante.
4. Sé honesto con los límites:
   - Las ballenas de Hyperliquid son una muestra, no todo el mercado.
   - Una ballena puede estar cubriendo una posición en otro sitio (por ejemplo,
     en spot).
   - Si la cobertura está por debajo del 50 %, la lectura es débil.
   - **No es una señal por sí sola**: úsala como confirmación de
     `/cripto-senal`.
5. Si el usuario tiene una posición abierta, sugiere `/cripto-posicion`, que ya
   compara a las ballenas con el momento de su señal.
