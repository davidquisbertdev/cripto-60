---
name: cripto-diario
description: >-
  Diario de operaciones y gestión del capital para crecer poco a
  poco: registra el resultado de cada trade, lleva el capital actual, la tasa
  de acierto, el resultado del día y las operaciones de la última hora, y
  aplica reglas de protección (pausa tras pérdidas seguidas, pérdida máxima
  diaria, operaciones por hora y por día) que /cripto-senal respeta
  automáticamente. Úsala cuando el usuario diga "gané 0.08 en SOL", "perdí
  0.2", "registra", "¿cuánto llevo?", "mi capital", "¿puedo seguir?",
  "empiezo con 10 USDT", "deposité 50".
argument-hint: "iniciar|registrar|ver|deposito|retiro|borrar"
---

# cripto-diario

```bash
node "${CLAUDE_SKILL_DIR}/diario.mjs" iniciar --capital 10            # empezar (con --forzar reinicia)
node "${CLAUDE_SKILL_DIR}/diario.mjs" registrar SOL --pnl 0.08 --lado short --nota "TP1+BE"
node "${CLAUDE_SKILL_DIR}/diario.mjs" registrar NEAR --pnl -0.24 --lado short --nota "SL"
node "${CLAUDE_SKILL_DIR}/diario.mjs" ver                             # capital, acierto, hoy, última hora, ¿puedo seguir?
node "${CLAUDE_SKILL_DIR}/diario.mjs" deposito --capital 50
node "${CLAUDE_SKILL_DIR}/diario.mjs" retiro --capital 20
node "${CLAUDE_SKILL_DIR}/diario.mjs" borrar                          # deshace el último registro
```

Se guarda en `trader/diario.json`. El PnL va en USDT, neto (lo que muestra el exchange
al cerrar, ya con comisiones), y es negativo si fue una pérdida.

## Reglas de protección (`trader/config.json`)

| regla | por defecto | efecto en /cripto-senal |
| --- | --- | --- |
| `perdidas_seguidas_mitad` | 2 | tras 2 pérdidas seguidas hoy, el riesgo por operación baja a la mitad |
| `perdidas_seguidas_pausa` + `pausa_min` | 2 y 30 | tras 2 pérdidas seguidas: pausa de 30 min |
| `perdidas_seguidas_parar` | 4 | tras 4 pérdidas seguidas: se para por hoy |
| `max_perdida_dia_pct` | 20 | si hoy perdiste el 20 % del capital: se para hasta mañana |
| `max_operaciones_hora` | 4 | con operaciones de 15 a 60 min, más de 4 por hora es sobre-trading |
| `max_operaciones_dia` | 20 | tope diario |

Las rachas solo cuentan las operaciones de hoy.

## Margen sugerido: que el capital crezca con lo ganado

`margen sugerido = margen_base (20) + 50 % de la ganancia acumulada`, nunca más
que el capital. Si empiezas con 20 y llevas +40 de ganancia, el margen sugerido
es 40. Llegas a meter 100 por operación con dinero ganado, no arriesgando de
golpe. `/cripto-senal` lo usa si el usuario no dice otro margen.

## Pasos

1. Cuando el usuario cuente un resultado, regístralo con el símbolo, el PnL y
   el lado. Si no dio el PnL exacto, pregúntaselo; no lo estimes.
2. Después muestra `ver`: el capital, el crecimiento, el **margen sugerido**
   para la siguiente operación y si puede seguir.
3. Si salta una pausa o un límite, dilo claro y con calma: la forma
   más rápida de perder es querer recuperar una pérdida en el minuto siguiente.
4. Cada 10 operaciones o así, comenta la tendencia: si la tasa de acierto y el
   PnL van mal en muchas operaciones, sugiere bajar el ritmo o el tamaño.
