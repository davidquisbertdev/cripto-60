---
version: 1
slug: "app"
primary_target: "app"
related_targets: []
---

# Superficie: app web de Cripto60

Modo: Operate. Todas las pantallas de la app: Acceso, Inicio, Señal, Posición, BTC, Ballenas, Noticias, Escáner, Diario, Ajustes y Letra pequeña.

- Usuario y tarea: el autor, con capital pequeño, pide una señal, entra a mano en su exchange, vigila el reloj, revisa la posición y registra el resultado. Uso igual en móvil (mientras opera) y en escritorio (al lado del exchange y para revisar el diario).
- Contenido: salida real del motor (`lib/`) vía Supabase Edge Functions; modo demo con datos grabados cuando no hay credenciales.
- Restricciones: las reglas de riesgo de PRODUCT.md se muestran, nunca se esconden; la pérdida posible va junto a la ganancia con el mismo peso; terminología fija en español.
- Pendiente: cobro y planes, alertas en tiempo real.

## Direction contract

THESIS: La app de trading que la categoría ya enseña (oscura, densa, números tabulares, verde y rojo con significado), hecha al nivel de Bybit y Hyperliquid. Rechaza la versión de aficionado: paneles con gradientes, tarjetas idénticas y números sin unidades.

OWN-WORLD: Fondo casi negro azulado en tres escalones de superficie, filetes de 1 px en lugar de sombras, Inter con cifras tabulares, verde #2EBD85 y rojo #F6465D solo para ganancia/pérdida y LONG/SHORT, un acento azul propio para la acción y la selección, ámbar solo para avisos y relojes a punto de vencer. Radios de 6 a 8 px y controles estándar.

STORY: El trader ve primero el veredicto y lo que arriesga, luego los niveles y el reloj; confía porque el historial real y la pérdida están a la vista; actúa copiando niveles a su exchange y registrando el resultado.

FIRST VIEWPORT: Escritorio: barra lateral de 220 px con navegación y capital; arriba, el buscador de moneda y capital con el botón Analizar; a la izquierda, el veredicto grande (LONG/SHORT/NO OPERAR, confianza) y la tabla de niveles con resultado en USDT; a la derecha, el reloj de la operación (caduca, sin TP1, cierre total) en cuenta regresiva, la barra de probabilidades y el historial real. Móvil: el mismo orden en una columna con barra de pestañas inferior.

FORM: Estándar de la categoría (canon), elegido por el usuario frente a la candidata 7 asignada; referencias de acabado: Bybit y Hyperliquid. seed:6c8766ccfcc2abe7

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
