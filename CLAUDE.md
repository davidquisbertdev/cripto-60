# CLAUDE.md — Cripto60 / cripto-trader-skill

Project map for Claude sessions. Read this instead of re-exploring the repo folder by folder.
**Keep it current** (see "Maintaining this file" at the end).

## Working with the owner

- The owner (david) writes in Spanish. **Reply in Spanish.** All UI text, skill output and code comments are Spanish.
- **Commit messages in English** (subject + short body), ending with the Co-Authored-By trailer.
- Fixed trading vocabulary (never translate in UI/skills): SEÑAL, LONG, SHORT, NO OPERAR, MANTENER, MOVER SL, REDUCIR, CERRAR, MEJOR ENTRADA, confianza ALTA/MEDIA/BAJA.
- Never invent performance numbers, testimonials or paying users (see PRODUCT.md "Evidence on Hand").
- Branch before committing on `main`; don't push unless asked.

## What this is

One trading engine for manual crypto perpetual-futures scalping (15–60 min trades, ~3 USDT target),
with three front ends that must give identical results:

1. **Claude skills** (`cripto-*/SKILL.md` + `*.mjs`): Node ≥18 CLIs, zero dependencies, public APIs only (no keys).
2. **Web app "Cripto60"** (`app/`): Vite + React + TS SPA, Firebase Hosting.
3. **Supabase backend** (`supabase/`): Postgres with RLS + Edge Function `motor` that runs the same engine in Deno.

The product never touches the user's exchange account; orders are placed by hand. Product/brand context:
`PRODUCT.md`; visual design system: `DESIGN.md` (+ `.impeccable/`). Dark purple brand, trading-app conventions.

## Repo map

| Path | What |
| --- | --- |
| `lib/` | The engine. Shared by skills, web demo, tests and the Edge Function. |
| `lib/defaults.mjs` | **All engine defaults** (pure module). Risk caps, TP R-multiples `tps_r` [1,1.8,2.6], split `reparto_tps` [50,25,25], `espera_max_min` 30, `duracion_max_min` 60, `apalancamiento_max` 30 / `apalancamiento_tope` 500, journal brakes. |
| `lib/fuentes.mjs` | Picks the data source: `binance.mjs` (default), `bybit.mjs`, `mexc.mjs`. All return the same shape. `mexc.mjs` also has offline (`--offline DIR`) / record (`--grabar DIR`) modes and symbol helpers. |
| `lib/motor.mjs` | `analizarSimbolo`: downloads everything for one coin (candles 1m/5m/15m/1h, BTC context, funding, book, news, whales). |
| `lib/analisis.mjs`, `indicadores.mjs`, `reversion.mjs`, `btc.mjs` | Multi-timeframe trend analysis, indicators, mean-reversion strategy, BTC filter (correlation/beta, blocks trades against BTC). |
| `lib/plan.mjs` | Trade plan: SL, TPs, contracts, leverage (from USDT target, capped by risk %, exchange max, liquidation ≥2× SL distance), scenarios in USDT. |
| `lib/simulacion.mjs`, `historial.mjs` | Monte Carlo on real candles; ~28 h real backtest of the same signal with fees ("historial real manda": negative → NO OPERAR). |
| `lib/ballenas.mjs`, `noticias.mjs` | Hyperliquid whales, top traders, OI, walls, `billeteraHL(dir)` (all positions of one wallet + 24 h activity; HL only returns the latest 2000 fills, hours for big whales, so open dates are not shown); leaderboard memoized in memory 12 h. RSS news + Fear & Greed (`miedoCodicia` with 30-day `historial`, `efectoFNG(fng, lado)`). |
| `lib/macro.mjs` | Gold (XAUUSDT) and WTI oil (CLUSDT) from Binance TradFi perps: changes 1 h/4 h/24 h/7 d, 24 h curve, 1 h correlation with BTC over 7 d. `efectoMacro`: a sudden move (gold ≥1.2 % / oil ≥2 % in 1 h) → alert and −5 confidence; never in the score. Used by `analizarSimbolo` (`a.macro`), the signal (`contexto.macro`) and `informeBTC` (`macro`). |
| `lib/fibonacci.mjs`, `flujo.mjs`, `liquidaciones.mjs` | Entry confluences, computed in `analizarSimbolo` (`a.fib`, `a.flujo`, `a.liquidaciones`). Fibonacci of the last 5m/15m swing impulse (`efectoFib`, `entradaFib` = patient limit at 50/61.8 %). CVD + OI from Binance Futures 5m klines (taker buy volume) and `openInterestHist`, 24 h, whatever the signal's exchange (`flujo-<SYM>-5m.json` / `-oi.json` in fixtures): regime of the last hour + CVD divergences (`efectoFlujo`). Liquidation map estimated from OI increases (10–100x mix, crossed ones removed = sweep) plus real HL whale liquidation prices (`efectoLiquidaciones`: magnet asymmetry, recent sweep, SL inside a strong zone). Each ±5, combined `CONFLUENCIA_MAX` ±8 in `confluencias()` (senal.mjs). |
| `lib/calendario.mjs` | Economic calendar from the public ForexFactory weekly JSON (`nfs.faireconomy.media`; investing.com blocks bots with 403). `clasificar`: USD High inflation/jobs/Fed → CRÍTICA, other USD High → ALTA, USD Medium / CNY-EUR-JPY High → MEDIA, rest ignored. `reaccion` = real BTC move 15/60 min after a released event (5m or 15m candles). The feed answers 429 when hit often: one attempt only (`json(..., { intentos: 1 })`), 1 h process memo + external cache (`cacheArchivo` = `trader/cache/calendario.json` in the CLI; in the web `acciones.mjs` `cacheCal(db)` stores it in `instantaneas_ballenas` under base `_calendario`), stale copy used up to 7 days on failure. In `analizarSimbolo` (`a.calendario`, only with news), the signal (`calendario`, `en_ventana`), `mercado` (Inicio panel) and the news skill. Fixture `tests/fixtures/calendario/` (CPI day 10/11/2026 + BTC 15m) feeds the demo. |
| `lib/diario.mjs`, `config.mjs`, `formato.mjs` | Journal state + daily brakes (pure); CLI config/journal files in `trader/`; formatting + arg parsing (`parseDuracion`). |
| `cripto-senal/` | Signal (LONG/SHORT/NO OPERAR + MEJOR ENTRADA). `generarSenal(a, op, cfg)`. Per side it applies the BTC filter, `efectoFNG` and `efectoBallenas` (whales strongly against → one level down). Output `ballenas.hl` = whale LONG/SHORT split for the web. |
| `cripto-posicion/` | Open-position review. `cargarPosicion(op, cfg, ahora, sym, senal)` (accepts `reparto`, `duracion`), `evaluar`. |
| `cripto-escaner/` | Scanner: quick technical filter of the most liquid perps, then `confirmar(sym)` runs the **full signal** on the top N aptas (`confirmarN`; CLI default 3, web action default 0) so scanner and signal agree; rows get `senal` (`resumenSenal`). In the web the Edge Function can't fit several full signals in one call (`WORKER_RESOURCE_LIMIT`), so `Escaner` confirms the top 3 itself with one `senal` call each (`resumen: true`: not saved, returns only the summary), 2 at a time. |
| `cripto-btc/`, `cripto-ballenas/`, `cripto-noticias/`, `cripto-diario/` | Other skills (each: `SKILL.md` + one `.mjs`). |
| `servidor/acciones.mjs` | **Web API of the engine**: `ejecutar(accion, params, {db, fuente})` for `estado, senal, posicion, btc, ballenas, billetera, noticias, escaner, mercado`. `configDe(ajustes)` merges user settings (whitelist `AJUSTES_EDITABLES`) and clamps caps. `conDuracion(cfg, min)` applies a per-trade duration; `conReparto(cfg, reparto)` sets 1–3 TPs and their % (TPs at the first N of `tps_r`), from Ajustes `reparto_tps` or per signal `params.reparto`. `mercado` = F&G 30 d, BTC 24 h (15m), breadth, distribution, movers, average funding. `billetera` = one Hyperliquid wallet (`params.dir`). Env-agnostic (Node + Deno). |
| `servidor/db-memoria.mjs` | In-memory db with the Supabase interface (tests, demo). |
| `supabase/migrations/` | `…_inicial.sql` (perfiles, operaciones, senales, posiciones, instantaneas_ballenas, RLS), `…_duracion_posicion.sql` (posiciones.duracion_max_min), `…_suscripcion.sql` (perfiles.activo, suscripcion_hasta, trigger, `suscripcion_activa()`). |
| `supabase/functions/motor/index.ts` | Edge Function: auth → `suscripcion_activa` RPC (402 if inactive) → `ejecutar`. Imports the engine from `_shared/motor/` (generated by `npm run motor:sync`, gitignored). |
| `app/` | Web SPA (details below). |
| `scripts/demo.mjs` | Regenerates `app/src/demo/datos.json` from fixtures (`npm run demo`). |
| `scripts/sync-motor.mjs` | Copies `lib/`, `cripto-*/*.mjs`, `servidor/acciones.mjs` into the Edge Function. |
| `tests/` | `node:test` suites with recorded real data in `tests/fixtures/<name>/` (no network). |
| `trader/` | Runtime state of the CLI skills (signals, journal, cache). Gitignored. |
| `.claude-plugin/` | Claude Code plugin/marketplace manifests (version 3.3.0). |

## Web app (`app/`)

- **Demo mode** when `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` are missing: `app/src/lib/api.ts` uses recorded engine output and a localStorage journal. No login, no logout button.
- Env files: `app/.env` (tracked, public payment data: `VITE_BINANCE_NOMBRE`, `VITE_BINANCE_QR`, `VITE_CONTACTO_URL`, `VITE_CONTACTO_TEXTO`); `app/.env.local` (ignored, Supabase keys). Vite must be restarted after changing env files.
- `src/App.tsx`: routing. Logged out → `Acceso` (sign in / reset only; **no sign-up**), `/suscripcion`, `/terminos`. Logged in without active subscription → only `SuscripcionPublica`. Active → `Shell` with `/ /senal /posicion /btc /ballenas /noticias /escaner /diario /ajustes /terminos` (`/legal` redirects). `/suscripcion` and the sidebar link only show when renewal is due (`porRenovar`: ≤ `RENOVAR_DIAS` 5 days left, in `sesion.tsx`); otherwise it redirects to `/`.
- `src/lib/sesion.tsx`: session context (`perfil`, `suscrita`, `estado`, `errorPerfil`, `refrescar`, `salir`, `aviso`).
- `src/lib/api.ts`: `backend` = Supabase or demo implementation of the same `Backend` interface (keep both in sync when adding methods).
- `src/lib/usar.ts`: `usePeticion` accepts a cache `clave`: re-entering a screen shows the cached response instantly without re-requesting it (BTC, Ballenas, wallet dialog, Noticias, Escáner); only the refresh button (`run`) fetches fresh. The cache lives in memory while the app session lasts.
- `src/lib/tipos.ts`: TS types of engine output (only fields the web uses).
- `src/components/`: `Shell` (collapsible sidebar, state in localStorage `cripto60-nav-plegada`; `ConfirmarSalida` logout modal), `ui.tsx` (Panel, Campo, Nota, KV, Filas…), `graficos.tsx` (Reloj, BarraProb, Escalera, CurvaCapital, LineaSerie, MedidorFNG, Histograma), `MercadoHoy` ("Cómo está el mercado hoy" panels on Inicio, uses `mercado`), `EditorTPs` (1–3 TPs + % split, used in Senal and Ajustes), `SelectorMoneda` (searchable coin combobox; Binance 24h tickers, fallback list, cached in sessionStorage), `Confluencias` (signal panels: confluences, liquidation heatmap `MapaCalorLiq`, CVD/OI `PanelFlujo`, `PanelFib`), `Calendario` (`PanelCalendario`, economic calendar on Inicio and Senal).
- `src/screens/`: `Inicio` (+ market of the day), `Senal` (coin — default BTC —, capital, margin, target, **duration**, **TPs for this signal**, whales panel), `Posicion` (followed position + manual review with 1–3 TPs and % split; change duration of the running trade), `Mercado` (Btc with an altcoin search: `AltFrenteBTC` shows the chosen coin vs BTC, gold/oil panels `OroPetroleo`, Ballenas with wallet dialog `VerBilletera`, Noticias with F&G 30 d, Escaner with "Señal completa" column filled by `useConfirmar`), `Cuenta` (Diario, Ajustes incl. leverage cap up to 500x, default duration/TP1 wait and TPs, Legal = Términos y condiciones), `Acceso`, `Suscripcion`.
- Payment QR image goes in `app/public/pago/binance-qr.png` (page shows a warning if missing).
- Styles: `src/styles/base.css` (tokens, light/dark) and `ui.css` (components). Reuse existing classes (`panel`, `field`, `seg`, `chip`, `combo`, `dialog`, `sus-*`).

## Subscription model

100 USDT/month via Binance Pay QR (receiver DeividCripto_bo), receipt over WhatsApp +591 76641480; no auto-renew.
Sign-up is disabled (`supabase/config.toml` `enable_signup = false`; on hosted Supabase also turn off "Allow new users to sign up").
Admin flow after payment: create the user in Supabase Auth → Users, then run
`update public.perfiles set activo = true, suscripcion_hasta = now() + interval '30 days' where id = (select id from auth.users where email = '…');`
`suscripcion_hasta = null` means no expiry (owner account). Users cannot change these columns (trigger `proteger_suscripcion`).

## Engine rules that no interface may bypass

- Real history decides: if the same signal lost on average with fees in the last ~28 h → NO OPERAR. A reversion against a directional BTC → NO OPERAR.
- SL 0.3 %–0.8 % (ATR-calibrated); max loss at SL 10/7/4 % of capital by confidence ALTA/MEDIA/BAJA (`riesgo_max_pct` 10); daily loss cap 20 %.
- Leverage: user-chosen cap (default 30x, `configDe` clamps to 1–500x), always also limited by exchange max and liquidation ≥ 2× SL distance.
- Journal brakes: 2 losses in a row → 30 min pause + half risk; 4 losses or −20 % in the day → stop until tomorrow.
- Duration: default 60 min (settings 15–1440); TP1 wait scales with it unless set. Per-trade override via `params.duracion` (signal) / `duracion` (position).
- TPs: default 3 (50/25/25 % at 1R/1.8R/2.6R); 1–3 TPs with any split summing 100, in Ajustes or per signal. History, simulation and sizing use the same split.
- Economic calendar: a CRÍTICA event inside the trade window (now → duration + 15 min) → one level down and −10 confidence; released ≤30 min ago → one level down and −5; ALTA → −5; MEDIA → alert only. Macro headlines of the last 6 h (CPI, Fed, tariffs…) with a clear direction → `noticias.alerta_macro` alert.
- USDT target (`objetivo`) never raises risk: sizing stays under the SL loss cap, margin and safe leverage; `plan.objetivo` explains what limits it (`limitante`, `alcanza`, `capital_necesario`, `margen_necesario`, `ayuda`).
- Fibonacci, CVD/OI and the liquidation map only adjust confidence (±8 combined) and refine the entry (patient Fibonacci limit, SL-in-liquidation-zone alert); never decide alone.
- Whales and Fear & Greed weigh in but never decide alone: whales strongly against a side → one level down; F&G extremes (≤20 / ≥80) going with the crowd → −5 confidence. Gold/oil only count on a sudden 1 h move (−5 confidence + alert).

## Commands

```bash
npm test                 # all engine + server tests (offline fixtures)
npm run web:dev          # Vite dev server (app/), demo mode without .env.local
npm run web:build        # tsc -b + vite build
npm run demo             # regenerate app/src/demo/datos.json
npm run deploy:funciones # motor:sync + supabase functions deploy motor
npm run deploy:web       # build + firebase deploy --only hosting
node cripto-senal/senal.mjs SOL --capital 20            # a skill from the CLI
node cripto-posicion/posicion.mjs SOL --entrada X --sl Y --tp1 A --reparto 70,30 --duracion 2h
```

Inside `app/`: `npx tsc -b` (typecheck), `npx eslint src` (existing warnings only; 0 errors expected).
`.claude/launch.json` has an `app` preview config (port 5173) and `app-demo` (port 5174, blanks the Supabase env so the app runs in demo mode even with `.env.local`).

## Gotchas

- Windows + PowerShell 5.1: prefer the Edit tool for source changes. Bulk `.Replace()` scripts in PowerShell have corrupted files before (nested arrays flatten; `R` is an alias of `Invoke-History`; non-ASCII literals can mis-encode). Write files as UTF-8 without BOM.
- Use `git commit -F <file>` for messages with quotes (PowerShell here-strings split on `"`).
- Engine modules used by the web/Edge Function must stay free of `node:fs` (`defaults`, `diario`, `plan`, analysis modules). I/O lives in `config.mjs`, `fuentes`/exchange modules, `formato.mjs`.
- After changing anything the Edge Function imports, run `npm run motor:sync` before deploying.
- `motor` keeps `verify_jwt = true` (owner's choice) and also validates the user itself (`auth.getUser`). The hosted project signs sessions with asymmetric keys (ES256); if logged-in calls ever get a gateway 401 `Invalid JWT`, that check is the suspect.
- Logout (`salir` in `sesion.tsx`) must always end on the login screen: when the token can't be refreshed, supabase-js returns an error without clearing the stored session, so the app removes `sb-*-auth-token` from localStorage and reloads.
- `firebase.json` serves `index.html` with `no-cache` so a deploy reaches users immediately (assets are hashed and cached for a year).
- New Supabase columns need a new migration file and must be applied before the web uses them (otherwise `perfil()` fails and the app shows an error screen).

## Maintaining this file

Update CLAUDE.md **in the same commit** whenever a change affects anything described here: new/renamed files or
folders, routes, settings, env vars, migrations, commands, engine rules, subscription/admin flow or conventions.
Keep it a map (what lives where and why), not a changelog; git history covers the rest.
