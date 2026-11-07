---
name: cripto-escaner
description: >-
  Escáner de futuros cripto en MEXC: toma los perpetuos USDT con más volumen
  (solo cripto, sin acciones, metales ni stablecoins), los analiza en 15m, 1h y
  4h con el contexto de BTC, y los ordena por confianza, con su sesgo (LONG o
  SHORT), la variación de 24 h, la volatilidad (ATR) y el funding. Úsala cuando
  el usuario pregunte "¿qué moneda opero hoy?", "busca oportunidades", "escanea
  el mercado", "¿cuál está más clara?", "top señales", "¿qué está fuerte?".
argument-hint: "[--top 30] [--mostrar 15]"
---

# cripto-escaner

```bash
node "${CLAUDE_SKILL_DIR}/escaner.mjs"                          # top 30 por volumen, muestra 15
node "${CLAUDE_SKILL_DIR}/escaner.mjs" --top 60 --mostrar 20
node "${CLAUDE_SKILL_DIR}/escaner.mjs" --min-volumen 20000000   # solo las de más de 20 M USDT al día
node "${CLAUDE_SKILL_DIR}/escaner.mjs" --json
```

Tarda unos segundos por moneda (3 peticiones a MEXC por cada una).

## Pasos

1. Ejecuta el escáner.
2. Muestra las 3 a 5 primeras que no estén marcadas como `lateral` o
   `extendido` y explica en una línea por qué destacan.
3. Advierte de las monedas con un ATR15 muy alto (más del 1 %): se mueven
   mucho, y con un capital pequeño el SL queda lejos o el tamaño mínimo no
   alcanza.
4. Si BTC está claramente bajista, casi todo saldrá SHORT, y al revés. Dilo:
   es el mercado, no 15 oportunidades distintas.
5. Ofrece la señal completa de la elegida: `/cripto-senal MONEDA --capital X`.
   El escáner no calcula entrada, SL ni tamaño.
