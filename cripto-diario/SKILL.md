---
name: cripto-diario
description: >-
  Diario de operaciones y gestión del capital para crecer poco a poco: registra
  el resultado de cada trade, lleva el capital actual, la tasa de acierto y el
  resultado del día, y aplica reglas de protección (pérdida máxima diaria,
  pérdidas seguidas, operaciones por día) que /cripto-senal respeta
  automáticamente. Úsala cuando el usuario diga "gané 0.8 en SOL", "perdí 1
  USDT", "registra la operación", "¿cuánto llevo?", "mi capital", "¿puedo
  operar hoy?", "empiezo con 10 USDT", "deposité 50".
argument-hint: "iniciar|registrar|ver|deposito|retiro|borrar"
---

# cripto-diario

```bash
node "${CLAUDE_SKILL_DIR}/diario.mjs" iniciar --capital 10            # empezar (con --forzar reinicia)
node "${CLAUDE_SKILL_DIR}/diario.mjs" registrar SOL --pnl 0.84 --lado short --nota "TP2"
node "${CLAUDE_SKILL_DIR}/diario.mjs" registrar MNT --pnl -0.5 --lado long --nota "SL"
node "${CLAUDE_SKILL_DIR}/diario.mjs" ver                             # capital, acierto, hoy, ¿puedo operar?
node "${CLAUDE_SKILL_DIR}/diario.mjs" deposito --capital 50
node "${CLAUDE_SKILL_DIR}/diario.mjs" retiro --capital 20
node "${CLAUDE_SKILL_DIR}/diario.mjs" borrar                          # deshace el último registro
```

Se guarda en `trader/diario.json`. El PnL va en USDT, neto (lo que muestra MEXC
al cerrar), y es negativo si fue una pérdida.

## Reglas de protección (`trader/config.json`)

| regla | por defecto | efecto en /cripto-senal |
| --- | --- | --- |
| `max_perdida_dia_pct` | 15 | si hoy perdiste el 15 % del capital: NO OPERAR hasta mañana |
| `perdidas_seguidas_mitad` | 2 | tras 2 pérdidas seguidas, el riesgo por operación baja a la mitad |
| `perdidas_seguidas_parar` | 3 | tras 3 pérdidas seguidas: NO OPERAR hoy |
| `max_operaciones_dia` | 4 | al llegar a 4 operaciones en el día: NO OPERAR |

## Pasos

1. Cuando el usuario cuente un resultado, regístralo con el símbolo, el PnL y
   el lado. Si no dio el PnL exacto, pregúntaselo; no lo estimes.
2. Después de registrar, muestra `ver`: el capital, cuánto creció y si puede
   seguir operando hoy.
3. Si salta una regla de protección, dilo con claridad y sin dramatismo: la idea
   es crecer poco a poco, y un día malo no se arregla forzando operaciones.
4. Cuando el capital crezca, la próxima `/cripto-senal` usa el capital del
   diario si el usuario no da otro.
