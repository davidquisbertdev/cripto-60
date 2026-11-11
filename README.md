# Cripto60

Skills de Claude para operar **futuros perpetuos de criptomonedas** (datos de **Binance** por defecto, o Bybit o MEXC con `--exchange bybit` / `--exchange mexc`) de
forma manual, en operaciones de **15 a 60 minutos** que buscan unos **3 USDT**
cada una: le pides una señal ("analiza SOL, tengo 10 USDT") y te dice si es
**LONG, SHORT o NO OPERAR**, con entrada, stop loss, **TP1, TP2 y TP3**, qué %
cerrar en cada uno, apalancamiento, margen, cuánto ganas o pierdes en USDT, las
probabilidades y **cuánto tiempo esperar como máximo** antes de cerrar.

La idea no es hacerse millonario de la noche a la mañana, sino hacer crecer el
capital poco a poco con una gestión de riesgo estricta. Las operaciones las
haces tú en tu exchange: nada de esto toca tu cuenta.

Las herramientas son Node.js (18 o superior) sin dependencias y leen datos
públicos sin API key: la API de futuros USDⓈ-M de Binance (o las de Bybit o MEXC); las posiciones on-chain de las
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
| `/cripto-escaner` | Ordena los futuros cripto más líquidos (Binance, Bybit o MEXC) por claridad del setup y confirma las 3 mejores con la señal completa, para que el escáner y la señal digan lo mismo. |
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
  100 %. Tras el TP1, SL a la entrada. En la web eliges **1, 2 o 3 TPs** y el % de cada
  uno en Ajustes o solo para una señal; el historial real, la simulación y el
  apalancamiento se calculan con ese reparto. Al revisar una posición abierta a mano
  puedes indicar **1, 2 o 3 TPs** y el % que cierra cada uno (`--reparto 70,30`).
- **Apalancamiento calculado para tu objetivo** (3 USDT por defecto):
  posición = objetivo / movimiento medio de los TP; apalancamiento = posición /
  margen. **Menos margen o un SL más cerca = más apalancamiento** para la misma
  ganancia. Ejemplo real: con 20 USDT hicieron falta 22x en ENA; con 100 USDT
  en MNT bastaron 10x.
- **Frenos que el objetivo nunca rompe**: la pérdida en el SL no pasa del 10 % /
  7 % / 4 % del capital (confianza ALTA / MEDIA / BAJA); la liquidación queda
  siempre al menos al doble de distancia que el SL; el apalancamiento máximo es
  de 30x por defecto y puedes subirlo hasta **500x** (`apalancamiento_max`), pero
  nunca pasa el máximo de la moneda en el exchange ni acerca la liquidación al SL.
  Si no llegas a 3 USDT, el informe te dice cuánto y por qué.
- **La cara B, siempre visible**: para ganar unos 3 USDT con 20 de margen, si salta
  el SL pierdes unos 1.4-2 USDT.
- **Reloj**: la entrada caduca en 5 min; sin TP1 en 10 a 30 min, se cierra; a los
  60 min se cierra todo. La **duración** se cambia por defecto (`duracion_max_min`,
  de 15 a 1440 min) o en cada operación (`--duracion 2h`); la espera del TP1 se
  ajusta en la misma proporción (30 de 60 → 60 de 120) y la simulación, el
  historial real y el reloj se calculan con esa duración.
- **Diario**: con 2 pérdidas seguidas, pausa de 30 min y riesgo a la mitad; con 4,
  o un 20 % perdido en el día, se para hasta mañana. **Margen sugerido** = 20 +
  50 % de lo ganado: el tamaño crece con tus ganancias.
- **Solo se recomienda lo que gana en el historial real reciente** de esa moneda
  (con comisiones). Si pierde en promedio: NO OPERAR.
- **Ballenas y sentimiento**: si las ballenas van fuerte en contra del lado, se baja un
  nivel; en los extremos del Fear & Greed (≤ 20 o ≥ 80) ir con la masa baja la
  confianza. Nunca deciden solos.
- **Oro y petróleo**: la lectura de BTC y la señal miran el oro y el petróleo WTI
  (perpetuos TradFi de Binance) y cuánto se parecen a BTC. No suman a la dirección;
  si uno se mueve de golpe en la última hora (noticia macro), se avisa y baja la confianza.

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
node cripto-posicion/posicion.mjs SOL --lado long --entrada 89.5 --sl 89.1 --tp1 89.9 --tp2 90.3 --reparto 70,30 --duracion 2h
node cripto-ballenas/ballenas.mjs SOL
node cripto-noticias/noticias.mjs SOL MNT --horas 48
node cripto-escaner/escaner.mjs --top 30
node cripto-diario/diario.mjs registrar SOL --pnl 0.68 --lado short
npm test                                  # tests offline con datos reales grabados
```

## App web

Además de las skills, el mismo motor tiene una interfaz web, **Cripto60** (`app/`), en móvil y
escritorio: Inicio, Señal, Posición, BTC, Ballenas, Noticias, Escáner, Diario, Ajustes, Suscripción (solo para renovar)
y Términos y condiciones.

- **Inicio**: además del capital y los frenos, **cómo está el mercado hoy**: Fear & Greed de hoy y
  de 30 días, BTC en 24 h, cuántas monedas suben o bajan, la distribución de los cambios, las que
  más se mueven y el funding medio; y el **calendario económico** (IPC, empleo, Fed de EE. UU.:
  importancia, previsión y cuánto se movió BTC tras cada dato).
- **Señal**: moneda (selector con buscador de los perpetuos USDT de Binance), capital, margen,
  objetivo, **duración** y **TPs** de la operación; panel de ballenas (LONG frente a SHORT),
  **confluencias** de la entrada, **mapa de calor de liquidaciones**, **CVD y open interest** y
  niveles de **Fibonacci** (con una entrada limit paciente en el 50/61.8 %). Si un dato macro
  fuerte cae dentro de la operación, la señal baja un nivel y avisa. Si el **objetivo** en USDT
  no se alcanza, dice qué lo frena y cuánto capital o margen haría falta.
- **Aperturas de mercado** (Inicio y Mercado): las del día con cuenta atrás (datos de EE. UU., bolsa
  de Nueva York, Hong Kong, futuros de Chicago) y alertas 5 y 1 min antes, con notificación y sonido.
  Son ventanas de riesgo para no entrar en el golpe; la señal avisa si una cae dentro de tu operación.
- **Mercado**: vista general (BTC, ETH, SOL, oro, petróleo, Fear & Greed, dominancia de BTC y USDT,
  calendario económico, ballenas, bots de trading y noticias). Con el filtro de moneda: esa moneda
  frente a BTC, sus ballenas, bots y noticias.
- **Señal**: también eliges lado y apalancamiento (con aviso de lo que recomienda el sistema) y te dice
  el mejor momento para entrar en los próximos 5 min (a mercado o con un limit y su probabilidad).
- **Escáner**: la columna «Señal completa» confirma las 3 mejores con el mismo análisis de la
  pantalla Señal.
- **Ballenas**: toca una billetera para ver **todas sus posiciones** en otras monedas y lo que hizo
  en 24 h (para seguirla, tipo copytrading).
- **Posición**: sigue la posición en la que entraste o revisa una a mano con **1, 2 o 3 TPs** y su
  reparto; puedes **alargar la operación en curso** (p. ej. de 60 a 120 min) y se vuelve a analizar.
- **Ajustes**: exchange, zona horaria, capital, objetivo, margen, **duración por defecto** y espera
  del TP1, **TPs** (cuántos y qué %), **apalancamiento máximo** (30x por defecto, hasta 500x) y frenos de pérdida.
- **Suscripción**: con la suscripción activa la página de venta no se muestra; vuelve a aparecer
  para renovar cuando quedan 5 días o menos.
- **Menú lateral plegable** (solo iconos) y confirmación antes de cerrar sesión.

Cómo está hecha:

- **Frontend**: Vite + React + TypeScript en `app/`, publicado en Firebase Hosting.
- **Backend**: Supabase. Cuentas con Supabase Auth; diario, señales, posición abierta y ajustes en
  Postgres con RLS (`supabase/migrations/`); el motor corre en la Edge Function `motor`
  (`supabase/functions/motor/`), que llama a `servidor/acciones.mjs`, que usa `lib/` y las skills tal cual.
- **Modo demo**: sin credenciales, la web usa salidas reales del motor grabadas de `tests/fixtures`
  (`npm run demo` las regenera) y un diario de ejemplo, y lo indica con una franja.

```bash
npm run web:dev                       # la web en http://localhost:5173 (modo demo)
npm run web:build                     # comprobación de tipos y build de producción
npm test                              # tests del motor y de las acciones del servidor
```

### Suscripción

El acceso a la web es de pago: **100 USDT al mes con Binance Pay**, sin renovación automática.
El registro libre está cerrado: no hay botón de crear cuenta.

- La página `/suscripcion` (pública) muestra el precio, qué incluye, el **QR de Binance Pay**
  (`app/public/pago/binance-qr.png`, descargable) y los pasos: pagar, poner el correo en la nota
  y mandar el comprobante por WhatsApp. Los datos públicos de pago están en `app/.env`
  (`VITE_BINANCE_NOMBRE`, `VITE_BINANCE_QR`, `VITE_CONTACTO_URL`, `VITE_CONTACTO_TEXTO`).
- Cada perfil tiene `activo` y `suscripcion_hasta` (`null` = sin fecha de fin). Sin suscripción
  activa, la Edge Function responde 402 y la web solo muestra la página para renovar. El usuario
  no puede cambiar su propia suscripción.
- Al recibir un pago: crea el usuario en Supabase (Authentication → Users → Add user) y actívalo
  en el SQL Editor:

```sql
update public.perfiles set activo = true, suscripcion_hasta = now() + interval '30 days'
where id = (select id from auth.users where email = 'correo@ejemplo.com');
```

Para renovar, suma 30 días a `suscripcion_hasta`.

### Producción

1. Crea un proyecto en [Supabase](https://supabase.com) e instala la CLI (`brew install supabase/tap/supabase`).
2. Crea tu propia cuenta (Authentication → Users → Add user) **antes** de las migraciones: la de la
   suscripción deja activas, sin fecha de fin, las cuentas que ya existen.
3. `supabase link --project-ref <ref>` y `supabase db push` (crea las tablas, las políticas y la suscripción).
4. En Authentication → Sign In / Providers, desactiva **Allow new users to sign up**.
5. `npm run deploy:funciones` (copia el motor a la función y la despliega). Opcional: limita el
   origen con `supabase secrets set ORIGENES_PERMITIDOS=https://tu-app.web.app`.
6. En Authentication → URL Configuration, pon la URL de tu web como Site URL.
7. Copia `app/.env.example` a `app/.env.local` con la URL y la anon key del proyecto.
8. Pon tu proyecto de Firebase en `.firebaserc` y `npm run deploy:web`.

Si creaste tu cuenta después de las migraciones, actívala con el SQL de arriba usando
`suscripcion_hasta = null`.

## Para desarrollar con Claude

`CLAUDE.md` describe el proyecto (estructura, motor, web, Supabase, comandos y convenciones) para
que cada sesión de Claude Code lo conozca sin explorarlo. Se actualiza en el mismo commit que
cualquier cambio que afecte lo que describe.

## Términos y condiciones

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

**Datos gratuitos**: las APIs públicas de Binance, Bybit y MEXC y los RSS pueden fallar o retrasarse.
Comprueba el precio en tu exchange antes de entrar.

Basado en [day-trader-skill](https://github.com/Jakeschincariol/day-trader-skill)
(MIT), reescrito para futuros cripto.
