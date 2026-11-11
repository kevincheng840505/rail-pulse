# Issue #66 phase 1: data provenance

Stacked on `fix/pr65-focus-regressions`; review that branch first. No merges are performed.

Timetable, delay and model positions have separate provenance. Every generated train and flight receives source metadata. Official metro headways remain estimated individual runs; flight positions always disclose their model. Empty delay responses no longer imply verified punctuality. The picker, train info, focus departures and flight info show source, last update and degraded states (missing, stale, offline, service error).

Validation: 16 Node tests passed, including all generated rail systems, actual generated flights, official/missing/zero delays, state mapping and focus restoration. Desktop/mobile Playwright focus flows passed without page errors using the documented empty remote-tile fixtures. Build regenerated. No live TDX account was used. Deployment connectivity and real provider data are not validated.
