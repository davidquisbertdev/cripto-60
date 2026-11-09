---
name: Cripto60
description: Señal LONG, SHORT o NO OPERAR con niveles, riesgo en USDT y reloj, en la convención oscura de las apps de trading.
colors:
  bg: "#0c0b12"
  surface-1: "#13111b"
  surface-2: "#1a1725"
  surface-3: "#221e2f"
  line: "#29243a"
  line-strong: "#3a3350"
  text: "#ece9f4"
  text-2: "#aea7c2"
  text-3: "#8f88a8"
  accent: "#a78bfa"
  accent-hover: "#c4b5fd"
  accent-fill: "#6d28d9"
  accent-fill-hover: "#7c3aed"
  accent-ink: "#ffffff"
  gain: "#2ebd85"
  loss: "#f6465d"
  warn: "#e5a93b"
  warn-text: "#f2bd57"
  neutral-mark: "#5a6478"
typography:
  display:
    fontFamily: "Inter Variable, Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "-0.02em"
    fontFeature: "'tnum', 'cv11'"
  headline:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.625rem"
    fontWeight: 700
    letterSpacing: "-0.02em"
    fontFeature: "'tnum', 'cv11'"
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 650
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "'cv11', 'ss01'"
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
  tag:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 650
    letterSpacing: "0.02em"
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "8": "32px"
components:
  button-primary:
    backgroundColor: "{colors.accent-fill}"
    textColor: "{colors.accent-ink}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-primary-hover:
    backgroundColor: "{colors.accent-fill-hover}"
    textColor: "{colors.accent-ink}"
  button-secondary:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  button-secondary-hover:
    backgroundColor: "{colors.surface-3}"
  button-ghost:
    textColor: "{colors.text-2}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "36px"
  input:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "36px"
  panel:
    backgroundColor: "{colors.surface-1}"
    rounded: "{rounded.lg}"
    padding: "16px"
  tag:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-2}"
    typography: "{typography.tag}"
    rounded: "{rounded.sm}"
    padding: "0 8px"
    height: "22px"
  tag-gain:
    textColor: "{colors.gain}"
  tag-loss:
    textColor: "{colors.loss}"
  nav-link-active:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text}"
    rounded: "{rounded.md}"
    padding: "7px 8px"
  nav:
    backgroundColor: "{colors.surface-1}"
    width: "220px"
---

# Design System: Cripto60

## Overview

**Creative North Star: "El terminal de guardia"**

La app de trading tal como la categoría ya la enseña: oscura, densa y hecha de números tabulares, con el verde y el rojo reservados para el resultado. Se usa de noche, al lado del exchange y con el reloj encima, así que la jerarquía es estricta: primero el veredicto y lo que se arriesga, luego los niveles y el reloj, y después el contexto. La vara de acabado es la de Bybit y Hyperliquid; se toma su nivel de oficio, nunca su marca, sus colores ni sus logotipos.

La profundidad sale de tres escalones de superficie sobre un fondo casi negro con tinte violeta y de filetes de 1 px, no de sombras ni de gradientes. Cada cifra lleva su unidad (USDT, %, x) y cada ganancia o pérdida su signo; los paneles son contenedores sobrios con cabecera y cuerpo, no tarjetas decorativas repetidas. El tema oscuro es el de serie; el claro existe como opción (`[data-theme='light']`) con los mismos roles.

**Key Characteristics:**
- Oscuro por defecto, claro opcional con los mismos tokens de rol.
- Tres superficies escalonadas y filetes de 1 px; sombra solo en lo que flota.
- Inter Variable autoalojada, cifras tabulares en todo dato numérico.
- Verde y rojo solo para dirección y resultado, siempre con signo, texto o flecha.
- Un morado propio para acción y selección; ámbar solo para avisos y relojes que vencen.
- Densidad de terminal: controles de 36 px, filas de 9 a 10 px de relleno vertical.

## Colors

Fondo casi negro con tinte violeta, neutros fríos en escalones cortos y cuatro colores con un único significado cada uno.

### Primary
- **Morado de mando** (accent): enlaces, foco, selección (icono de la sección activa, línea del gráfico de capital, barra del reloj en marcha, caret).
- **Morado de botón** (accent-fill): relleno del botón principal y de la marca. Es más oscuro que el acento a propósito: el texto blanco (accent-ink) sobre él pasa contraste, y sobre el acento claro no.

### Secondary
- **Verde de ganancia** (gain): beneficio, niveles TP, LONG y sesgo alcista. Color de contrato de la categoría.
- **Rojo de pérdida** (loss): pérdida, stop loss, SHORT, sesgo bajista y errores de campo. Color de contrato de la categoría.

### Tertiary
- **Ámbar de aviso** (warn / warn-text): notas de aviso, la banda de modo demo, el punto de posición abierta en la navegación, y el reloj cuando le queda poco. `warn` pinta rellenos y marcas; `warn-text` es la variante legible para texto.

### Neutral
- **Fondo de noche** (bg): lienzo de la app y de la barra superior.
- **Superficie 1** (surface-1): paneles, barra lateral, barra de pestañas, diálogos.
- **Superficie 2** (surface-2): campos, botón secundario, hover de filas y enlaces.
- **Superficie 3** (surface-3): elemento seleccionado, etiquetas neutras, pistas de barras, tooltip y toast.
- **Filete** (line): separadores de 1 px entre filas, paneles y zonas.
- **Filete fuerte** (line-strong): borde de campos, botones y capas flotantes.
- **Texto** (text), **Texto 2** (text-2: etiquetas de fila, prosa secundaria), **Texto 3** (text-3: claves de dato, cabeceras de tabla, placeholders, ejes).
- **Gris de marca neutra** (neutral-mark): el tercer valor en barras de probabilidad y medidores (cierre por tiempo, sesgo neutro, reloj vencido).

El tema claro redefine los mismos roles en `app/src/styles/base.css` (valores en el sidecar, `extensions.themes.light`); verde, rojo y ámbar bajan de luminosidad y tienen variante `-text` propia para pasar contraste sobre blanco.

### Named Rules
**The Verde y Rojo con Significado Rule.** El verde y el rojo solo dicen dirección o resultado: ganancia y pérdida, LONG y SHORT, alcista y bajista. Nunca decoran, nunca marcan una sección ni un estado de sistema.

**The Nunca Solo Color Rule.** Verde y rojo están cerca para la visión de color deficiente, así que siempre van con signo (+ / −, con el signo menos tipográfico), con la palabra (LONG, SHORT, en contra) o con la flecha (↗ / ↘). Una cifra coloreada sin signo es un defecto.

**The Ámbar es Tiempo y Riesgo Rule.** El ámbar solo avisa: notas de riesgo, modo demo, posición abierta, reloj a punto de vencer. No es un segundo acento.

**The Un Solo Morado Rule.** El morado es el color de la acción y de la selección; no se usa para datos de mercado.

## Typography

**Display Font:** Inter Variable (autoalojada con `@fontsource-variable/inter`; respaldo Inter, system-ui, -apple-system, Segoe UI, Roboto)
**Body Font:** la misma
**Label/Mono Font:** la misma; los números usan cifras tabulares, no una monoespaciada.

**Character:** Una sola familia neutra y técnica, con `cv11` y `ss01` activos en todo el cuerpo; el peso hace la jerarquía y las cifras tabulares hacen que las columnas de precios se alineen.

### Hierarchy
- **Display** (750, 2.25rem, 1): la palabra del veredicto (LONG / SHORT / NO OPERAR) y la acción de posición (MANTENER, REDUCIR, CERRAR). Baja a 1.625rem en ≤640px.
- **Headline** (700, 1.625rem): las dos cifras de dinero del plan (lo que pierdes en el SL, lo que ganas en los TP), con la unidad al 0.55em. También el título del formulario de acceso.
- **Title** (650, 1.25rem): título de la barra superior, capital en la barra lateral, cuenta regresiva del reloj.
- **Body** (400, 0.875rem, 1.5): texto, filas, tablas, botones. Los títulos de panel usan este tamaño a 600. La prosa larga sube a 1rem con interlineado 1.65 y máximo 70ch.
- **Label** (500, 0.75rem): claves de dato, cabeceras de tabla y sublíneas, en texto 3. Sin mayúsculas forzadas.
- **Tag** (650, 0.75rem, 0.02em): etiquetas de lado y de confianza.

### Named Rules
**The Cifra Tabular Rule.** Todo número que se compara o que cambia (precios, USDT, %, relojes, ejes) lleva cifras tabulares.

**The Punto Decimal Rule.** Los números se formatean con punto decimal y separador de miles con coma (formato en-US), como el exchange y el motor, para que los niveles se copien tal cual a la orden. Las horas y fechas sí van en español, en 24 h.

**The Cifra con Unidad Rule.** Ninguna cifra va sin unidad: USDT, %, x, R o la moneda.

## Layout

Aplicación con barra lateral fija de 220 px (navegación agrupada con filetes y, al pie, el capital) y una columna principal con barra superior pegajosa de 60 px y contenido hasta 1360 px, con 24 px de relleno y 20 px entre paneles.

La pantalla de señal usa una rejilla principal + lateral (columna flexible y otra de 360 px); por debajo de 1180 px pasa a una columna y reordena lo urgente primero: veredicto, reloj, probabilidades. Hay rejillas de 2 y 3 columnas que bajan a una en ≤640px.

En ≤900px desaparece la barra lateral: entra una barra de pestañas inferior de cinco posiciones (la quinta es «Más», que abre una hoja inferior con el resto de secciones), el relleno baja a 16 px y el contenido deja sitio a la barra y al área segura.

Ritmo en pasos de 4 px (4, 8, 12, 16, 20, 24, 32). Densidad de terminal: controles de 36 px (30 px pequeño, 44 px grande), filas de dato con 9 a 10 px de relleno vertical, paneles con 16 px.

## Elevation & Depth

Sistema plano. La profundidad se construye con tres escalones de superficie sobre el fondo y con filetes de 1 px; los paneles no tienen sombra. Solo lo que flota sobre el contenido (tooltip del gráfico, toast, diálogo) lleva sombra, y la hoja inferior móvil y los diálogos se apoyan además en un velo negro al 50 a 55 %.

### Shadow Vocabulary
- **Flotante** (`box-shadow: 0 8px 24px rgba(0,0,0,0.35), 0 1px 2px rgba(0,0,0,0.3)`; en claro `0 8px 24px rgba(15,23,42,0.1), 0 1px 2px rgba(15,23,42,0.08)`): tooltip, toast y diálogo.
- **Anillo de foco de campo** (`box-shadow: 0 0 0 3px` acento suave): solo en campos con foco.

### Named Rules
**The Filete, no Sombra Rule.** Lo que está en la página se separa con un filete de 1 px; la sombra es exclusiva de lo que flota encima.

## Shapes

Radios contenidos y estándar: 4 px en etiquetas, barras y elementos internos; 6 px en botones, campos, avisos y enlaces de navegación; 8 px en paneles, diálogos y toasts. La única excepción es la hoja inferior móvil, con esquinas superiores de 14 px, como corresponde a una hoja del sistema. Bordes siempre de 1 px; barras de datos finas (3 a 10 px de alto) con extremos levemente redondeados.

## Components

### Buttons
- **Shape:** esquinas suaves (6px), altura 36 px.
- **Primary:** relleno morado de botón con texto blanco, 600, 16 px de relleno horizontal. Uno por zona: Analizar, Entré, Guardar.
- **Hover / Focus:** el relleno sube un tono; al pulsar baja 1 px; foco con contorno morado de 2 px separado 2 px. Desactivado al 55 % de opacidad.
- **Secondary:** superficie 2 con filete fuerte; hover a superficie 3 (Copiar niveles).
- **Ghost:** sin fondo ni borde, texto 2; hover a superficie 2.
- **Danger:** el secundario con el texto en rojo de pérdida, para acciones destructivas.
- Tamaños: pequeño 30 px, grande 44 px, botón de icono cuadrado de 36 px.

### Chips
- **Style:** etiqueta de 22 px, radio 4 px, 0.75rem a 650, fondo suave del color de su significado (14 % de opacidad) y texto en el color pleno.
- **State:** LONG en verde con flecha ↗, SHORT en rojo con flecha ↘, NO OPERAR neutra con icono de prohibido. Los iconos son SVG de lucide.
- **Segmentado:** grupo de botones de 30 px dentro de un contenedor de superficie 2; el pulsado pasa a superficie 3.

### Cards / Containers
- **Corner Style:** 8 px.
- **Background:** superficie 1.
- **Shadow Strategy:** ninguna (ver Elevation & Depth).
- **Border:** filete de 1 px.
- **Internal Padding:** cabecera de 46 px mínimo con título a 600 y un apunte a la derecha en texto 2, separada por filete; cuerpo de 16 px o a sangre para tablas y listas.

### Inputs / Fields
- **Style:** 36 px, superficie 2, filete fuerte, radio 6 px; etiqueta encima a 0.8125rem y 500 en texto 2; la unidad (USDT) como sufijo dentro del campo en texto 3.
- **Focus:** borde morado más anillo de 3 px de acento suave; hover sube el borde a texto 3.
- **Error / Disabled:** borde rojo de pérdida y mensaje en 0.75rem rojo debajo; pista en texto 3.

### Navigation
- **Escritorio:** barra lateral en superficie 1 con filete derecho; enlaces de 0.875rem a 500 en texto 2 con icono de 17 px; hover a superficie 2; activo en superficie 3 con texto pleno e icono morado. Punto ámbar de 7 px cuando hay una posición abierta. Grupos separados por filete.
- **Móvil (≤900px):** barra de pestañas inferior fija en superficie 1, iconos de 20 px con etiqueta de 11 px en texto 3; la activa en texto pleno con icono morado. «Más» abre una hoja inferior con el resto de secciones.

### Veredicto
La firma de la app. La palabra LONG / SHORT / NO OPERAR en Display, coloreada por lado y precedida por su flecha, seguida de moneda, estrategia, precio y hora, con las etiquetas de confianza a la derecha. Debajo, la tabla de niveles (precio, distancia, porcentaje que cierra, resultado en USDT con signo) y la franja de dinero: lo que se pierde en el SL y lo que se gana en los TP, lado a lado.

### Reloj de la operación
Filas con qué vence, a qué hora y la cuenta regresiva en Title, sobre una barra de 3 px que se vacía: morado mientras corre, ámbar cuando queda poco, gris neutro cuando ya pasó.

### Barras de datos
Barra de probabilidades segmentada de 10 px (TP1 verde, SL rojo, por tiempo gris neutro) con leyenda que nombra cada tramo y su porcentaje; medidor de dirección de −1 a +1 sobre un degradado de rojo suave a verde suave con un pin del color del sesgo.

## Do's and Don'ts

### Do:
- **Do** separar zonas con filetes de 1 px y escalonar superficies (bg, surface-1, surface-2, surface-3) en vez de usar sombras.
- **Do** acompañar cada verde o rojo con signo (+ / −), palabra o flecha.
- **Do** formatear los números con punto decimal y cifras tabulares, y poner siempre la unidad.
- **Do** usar el morado de botón (#6d28d9) para rellenos con texto blanco y el morado de mando (#a78bfa) para enlaces, foco y selección.
- **Do** reservar el ámbar para avisos y relojes a punto de vencer.
- **Do** ordenar cada pantalla por urgencia: veredicto y riesgo, luego niveles y reloj, luego contexto.
- **Do** mantener los dos temas por roles: todo color sale de una variable de `base.css`.

### Don't:
- **Don't** usar verde o rojo como decoración, color de sección o acento.
- **Don't** usar coma decimal en precios o niveles: se copian a un exchange.
- **Don't** poner sombra a paneles o elementos que no flotan.
- **Don't** usar gradientes decorativos en paneles ni repetir tarjetas idénticas como relleno.
- **Don't** mostrar una cifra sin unidad ni un resultado sin signo.
- **Don't** tomar colores, marca ni logotipos de Bybit, Hyperliquid u otro exchange; solo su nivel de acabado.
