# Review sequence for PR #65 and Issue #66

The author had already merged #65 into the #64 branch (`5c74b13`). This work does not modify main or merge any PR. The following independent branches are stacked to keep review diffs small:

| Stage | Head | PR base | Description |
| --- | --- | --- | --- |
| #65 regressions | `fix/pr65-focus-regressions` | `claude/project-thread-107bd4` | `docs/pr65-validation.md` |
| #66 phase 1 | `feat/66-data-provenance` | `fix/pr65-focus-regressions` | `docs/issue66-phase1.md` |
| #66 phase 2 | `feat/66-tdx-proxy` | `feat/66-data-provenance` | `docs/issue66-phase2.md` |
| #66 phase 3 | `test/66-ci-regressions` | `feat/66-tdx-proxy` | `docs/issue66-phase3.md` |

Git push is available, but both GitHub REST and GraphQL requests are refused by the cloud egress policy. `gh pr create` was attempted and failed with `Post https://api.github.com/graphql: Forbidden`. Consequently PR creation is blocked; do not interpret a pushed branch as an opened PR. Allow `api.github.com` in environment settings, then retry creation using existing injected authentication. Do not request or expose a PAT just because `gh auth status` cannot validate the proxy-backed binding.

After API access is restored, these commands create reviewable PRs without merging them (run in the checkout containing these files):

```sh
gh pr create --repo kevincheng840505/rail-pulse --base claude/project-thread-107bd4 --head fix/pr65-focus-regressions --title 'fix: validate PR #65 focus restoration and timetable changes' --body-file docs/pr65-validation.md
gh pr create --repo kevincheng840505/rail-pulse --base fix/pr65-focus-regressions --head feat/66-data-provenance --title 'feat: disclose timetable, delay and model provenance (#66 phase 1)' --body-file docs/issue66-phase1.md
gh pr create --repo kevincheng840505/rail-pulse --base feat/66-data-provenance --head feat/66-tdx-proxy --title 'feat: add secure TDX proxy and keyless mode (#66 phase 2)' --body-file docs/issue66-phase2.md
gh pr create --repo kevincheng840505/rail-pulse --base feat/66-tdx-proxy --head test/66-ci-regressions --title 'test: add PR CI, browser regressions and performance evidence (#66 phase 3)' --body-file docs/issue66-phase3.md
```

Review in the listed order. No automatic merging or production deployment is configured. GitHub CI will run only after the workflow reaches an eligible remote event; local test results are not a claim that GitHub CI has run. Real Cloudflare deployment, TDX authentication and live map egress remain separate rollout checks.
