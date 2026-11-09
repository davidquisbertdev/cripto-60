# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

Delegado (recomendación registrada, aún sin construir):

- **Frontend:** SPA con Vite + React + TypeScript, build estático publicado en Firebase Hosting (plan gratuito).
- **Backend:** Supabase (plan gratuito): Auth para cuentas de usuario y Postgres para diario, capital, configuración e historial de señales.
- **Motor:** se reusa `lib/` como única fuente de verdad. Los módulos de cálculo (`analisis`, `indicadores`, `plan`, `reversion`, `simulacion`, `btc`) no dependen de Node; los de E/S (`config`, `fuentes`, `mexc`, `formato`, `ballenas`) usan `node:fs` y necesitan un adaptador. El motor corre en Supabase Edge Functions (Deno acepta ESM e imports `node:`), no en el navegador: así la lógica no se expone al venderla, se evitan los problemas de CORS de las APIs públicas y las skills de Claude y la web dan el mismo resultado.
- Las skills de Claude Code (CLI en Node, sin dependencias) siguen funcionando igual; la web es una segunda interfaz del mismo motor.

## Users

- **Hoy:** el propio autor (david), operando a mano futuros perpetuos en su exchange, con capital pequeño (10 a 100 USDT), en sesiones donde abre la señal, entra, vigila el reloj y revisa la posición minutos después.
- **Más adelante (sin confirmar):** otros traders hispanohablantes con capital pequeño, con cuenta propia en la web de pago.

## Product Purpose

Decir, para una moneda y un capital concretos, si operar **LONG, SHORT o NO OPERAR** en una ventana de 15 a 60 minutos que busca unos 3 USDT, con entrada, SL, TP1 a TP3, apalancamiento, margen, ganancia y pérdida en USDT, probabilidades y la hora límite para cerrar. También revisa la posición abierta, lee a Bitcoin y a las ballenas, filtra noticias, escanea monedas y lleva un diario que frena la operativa cuando el día va mal.

El éxito es hacer crecer el capital poco a poco sin romper la gestión de riesgo, no acertar muchas operaciones.

## Positioning

Solo recomienda lo que **ganó de verdad en el historial real reciente de esa moneda, con comisiones**; si pierde en promedio, dice NO OPERAR. Calcula el apalancamiento a partir del objetivo en USDT y siempre muestra la cara B (cuánto pierdes si salta el SL). Cada señal incluye un reloj: cuándo caduca la entrada y cuándo cerrar.

## Operating Context

- El usuario ejecuta las órdenes a mano en su exchange; el producto nunca toca la cuenta ni pide API keys.
- Datos públicos sin API key: futuros USDⓈ-M de Binance (por defecto) o MEXC, posiciones on-chain de ballenas de Hyperliquid, ratios de top traders y open interest de Binance/Bybit, RSS (Cointelegraph, Decrypt, CoinDesk) y Fear & Greed de alternative.me.
- El uso es con el tiempo encima: la entrada caduca en 5 min, sin TP1 se cierra a los 10 a 30 min y todo a los 60.
- Persistencia actual en `trader/` (`senal-<MONEDA>.json`, `diario.json`, `config.json`).

## Capabilities and Constraints

- Skills: `cripto-senal`, `cripto-btc`, `cripto-posicion`, `cripto-ballenas`, `cripto-noticias`, `cripto-escaner` y `cripto-diario`.
- La señal evalúa dos estrategias (TENDENCIA y REVERSIÓN a la media) y recomienda la que gana en el historial. Una reversión contra BTC sale NO OPERAR.
- Reglas de riesgo que ninguna interfaz puede saltarse: SL entre 0.3 % y 0.8 %; TPs a 1R, 1.8R y 2.6R; pérdida máxima en el SL del 10 %, 7 % o 4 % del capital (confianza ALTA, MEDIA o BAJA); liquidación a al menos el doble de distancia que el SL; tope de 30x; con 2 pérdidas seguidas, pausa de 30 min y riesgo a la mitad; con 4 pérdidas o un 20 % perdido en el día, se para hasta mañana.
- Terminología fija en español: SEÑAL, LONG, SHORT, NO OPERAR, MANTENER, MOVER SL, REDUCIR, CERRAR, MEJOR ENTRADA, confianza ALTA/MEDIA/BAJA.
- **Abierto:** el modelo de cobro, los planes y precios, si habrá app móvil y si la web tendrá alertas en tiempo real.

## Brand Commitments

- **Color primario: morado oscuro** (pedido por el usuario el 9/11/2026, con el tema «Astra» de VS Code como referencia de ambiente; no se copia ningún tema).
- **Estándar de la categoría (elegido por el usuario el 9/11/2026):** la app sigue la convención de las apps de trading (oscura, números tabulares, verde y rojo para ganancia y pérdida), hecha con todo el oficio. La vara de acabado son Bybit y Hyperliquid; se toma su nivel, nunca su marca, colores propios ni logotipos.
- Nombre: **Cripto60** (elegido el 9/11/2026; antes «Cripto Trader»). El plugin de Claude mantiene el identificador `cripto-trader-skill`. Licencia MIT, basado en day-trader-skill de Jakeschincariol.
- Voz: español directo, en segunda persona, con cifras concretas en USDT y sin promesas («la idea no es hacerse millonario de la noche a la mañana»).
- La letra pequeña es obligatoria: no es asesoría financiera, la confianza no es una probabilidad, un stop no es una garantía y si el historial sale negativo, hay que creerle.

## Evidence on Hand

- Ejemplos de salida reales en `README.md` (NEAR, 7/11/2026) y señales recientes en `trader/senal-*.json`.
- Datos de mercado grabados en `tests/fixtures/` (p. ej. `ballenas-mnt/`).
- **No existen** usuarios de pago, testimonios, rentabilidades auditadas ni métricas de rendimiento públicas: no deben inventarse.

## Product Principles

1. **El historial real manda.** Si la señal pierde con comisiones, la respuesta es NO OPERAR, aunque los indicadores digan otra cosa.
2. **El riesgo antes que la ganancia.** La pérdida posible se muestra siempre junto a la ganancia, con el mismo peso.
3. **El tiempo es parte de la orden.** Cada recomendación lleva su hora de caducidad y de cierre.
4. **Un solo motor.** La web, las skills y cualquier interfaz futura dan el mismo resultado con los mismos datos.
5. **Nunca tocar la cuenta del usuario.** Solo datos públicos; la ejecución es siempre manual.
