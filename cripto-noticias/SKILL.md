---
name: cripto-noticias
description: >-
  Noticias cripto recientes por moneda y del mercado en general (Cointelegraph,
  Decrypt, CoinDesk por RSS), con un sentimiento simple por titular, alertas de
  riesgo (hacks, deslistados, caídas de red), alertas de noticias macro
  (inflación, Fed, aranceles), el CALENDARIO ECONÓMICO (IPC, empleo, Fed de
  EE. UU. con su importancia, previsión y cuánto se movió BTC tras cada dato) y
  el índice Fear & Greed. Úsala
  cuando el usuario pregunte "¿hay noticias de SOL?", "¿qué pasa con el
  mercado?", "¿por qué cae BTC?", "¿qué datos salen hoy?", "calendario económico", "¿salió algo de MNT?", "sentimiento del
  mercado", o antes de una operación si quiere revisar el contexto.
argument-hint: "[MONEDA ...] [--horas 24]"
---

# cripto-noticias

```bash
node "${CLAUDE_SKILL_DIR}/noticias.mjs" SOL                 # SOL, últimas 24 h, más el mercado general
node "${CLAUDE_SKILL_DIR}/noticias.mjs" SOL MNT --horas 48
node "${CLAUDE_SKILL_DIR}/noticias.mjs"                     # solo el mercado (BTC y macro)
node "${CLAUDE_SKILL_DIR}/noticias.mjs" ETH --json
```

## Pasos

1. Ejecuta la herramienta con las monedas que pidió el usuario.
2. Si tienes WebSearch, complétalo con una búsqueda de la última hora: el RSS
   cubre los grandes medios en inglés, pero las monedas pequeñas (por ejemplo
   MNT) casi nunca salen. Busca "<nombre> crypto news", anuncios oficiales de
   la red o del exchange, desbloqueos de tokens y la agenda macro del día (Fed,
   CPI, empleo).
3. Resume en español: qué pasó, si es alcista, bajista o ruido, y si cambia algo
   para operar hoy. Una noticia de riesgo (hack, deslistado, demanda) en las
   últimas horas significa no abrir posiciones en esa moneda.
4. El sentimiento es un conteo de palabras clave en inglés: es orientativo. Lee
   los titulares antes de opinar.

Esta skill la usan también `/cripto-senal` y `/cripto-posicion`, que ya incluyen
las noticias en su análisis.
