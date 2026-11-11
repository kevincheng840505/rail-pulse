# PR #65 regression validation

Base: PR #64 head `5c74b13` (the author already merged #65 into that branch). No PR was merged by this work.

Found and fixed:
- Official and estimated services with identical numbers could be confused during restore.
- Timetable replacement reused a destination array index, selecting another station or throwing when removed.
- Restored rides/tickets remained behind the opening screen. Restoring now dismisses it without attempting music autoplay.
- Anonymous service ties now sort by full service identity.
- Official restore waits for the current timetable load to settle before safely cancelling a missing match. Older saved rides without verifiable destination/source identity safely reset.

Validation: `node --test tests/focus.test.cjs`: 10 passed. Covers TRA/THSR/metro reload, background/midnight elapsed time, delay accounting, fourth-ticket long break, timetable replacement and source mismatch.

Playwright + system Chromium at 1280×800 and 390×844: start, departure selection, reload with identical ride start, arrival ticket and rest passed with no page errors. Real MapLibre 4.7.1 from npm was served locally; remote tiles were replaced by an empty vector fixture because the cloud egress policy denies map/CDN destinations. This is not a live external map test. Screenshots: `docs/screenshots/focus-{1280,390}.png`, `ticket-{1280,390}.png`.

`python3 build.py` and JavaScript syntax checks passed. No real TDX credentials were used; official data transitions are tested with controlled objects.
