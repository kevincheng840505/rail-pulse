# Issue #66 phase 3: CI and reproducible regressions

Stacked on `feat/66-tdx-proxy`. Adds frozen npm dependencies, PR CI build-output synchronization, source/bundle JavaScript syntax validation, Node regressions, and desktop/mobile Playwright tests. Tests exposed partial refresh loss: a missing rail system or failed metro refresh now retains its previous services with an explicit degraded label.

Validation on the final code:
- 26 Node tests passed; source and bundled JavaScript syntax passed.
- 22 Playwright tests passed (1280×800 and 390×844). Covers TRA, THSR and metro start/countdown/reload/arrival/rest, fourth-ticket long break, midnight, rail-data failure, empty services, TDX timeout, repeated application, keyless official data and visible service-error/stale/offline states.
- An earlier E2E iteration selected TRA while preparing a metro fixture because animation updates replaced the temporary selection filter. The fixture now filters each update until boarding and restores the original updater immediately; the full final suite passes without retries.
- `npm ci` passed; `python3 build.py` reproduces the committed bundle.
- Wrangler 4.160.0 `deploy --dry-run` passed, including the managed rate-limit binding. No deployment occurred.

Tests use real Chromium/MapLibre and deterministic empty vector tiles plus synthetic TDX responses. They verify the application and transport contracts, not live maps, real TDX credentials or production Cloudflare behavior. GitHub CI has not run yet because PR creation is network-blocked.

## Performance evidence

Performance API observer records the first enabled opening button; a 2-second map render/RAF sample records FPS and Chromium heap usage. Both revisions use the same fixed wall clock and fixtures. This is one cloud/SwiftShader sample without controlled garbage collection, not a statistical benchmark or a performance-improvement claim. Raw data: [performance-sample.json](performance-sample.json).

| Viewport | First interactive ms, before → after | Map FPS, before → after | JS heap MiB, before → after |
| --- | --- | --- | --- |
| desktop | 199.7 → 129.7 | 13.0 → 9.4 | 58.4 → 78.7 |
| mobile | 123.9 → 134.4 | 21.4 → 21.4 | 71.7 → 58.9 |

Baseline: PR #64 head `5c74b13` (includes #65). Final branch includes the three development stages. Rendering/heap measurements vary with software rendering and GC; validate performance budgets on target hardware before rollout. No rendering optimization or hardware FPS guarantee is claimed.

Screenshots: [desktop departures](screenshots/departures-desktop.png), [mobile departures](screenshots/departures-mobile.png), and arrival tickets in `docs/screenshots/`. CI uploads screenshots, failure traces and performance samples as `browser-results` artifacts.
