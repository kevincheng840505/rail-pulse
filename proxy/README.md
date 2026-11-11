# TDX edge proxy

This is an optional Cloudflare Worker deployment. The static app keeps its no-account estimated mode. A site operator deploys this proxy once so visitors do not enter a Client Secret. No production deployment has been performed by this change.

1. Install a current official Wrangler CLI (Node 22+).
2. In this directory, run `wrangler secret put TDX_CLIENT_ID` and `wrangler secret put TDX_CLIENT_SECRET`. Enter values securely into Wrangler; do not commit or paste them into chat, source, config, CI logs, `.dev.vars` or screenshots.
3. Set `ALLOWED_ORIGINS` to exact site origins in `wrangler.toml`. The rate-limit binding is mandatory (60 requests/IP/minute); check account support before deploying. This is a per-edge abuse mitigation, not a global billing/quota guarantee. Add account-level WAF/quota protections for a public high-traffic deployment.
4. Run `wrangler deploy` under your account after reviewing the deployment. No arbitrary upstream targets are allowed. Credentials only go to the fixed TDX HTTPS token endpoint; bearer tokens only go to fixed basic API endpoints.
5. In the app settings, enter the returned HTTPS root URL and select **使用免金鑰模式**. For a site-wide default, set `meta[name="tdx-proxy"]` in `src/template.html`, run `python3 build.py`, and deploy the updated site. This URL is public configuration, not a secret.
6. Validate a GET to `/tdx/v2/Rail/TRA/LiveTrainDelay` with the configured `Origin`. Expect JSON plus `X-Data-Updated-At`. Verify real TDX responses and throttling with your account; the automated tests use synthetic upstream responses.

Only GET/OPTIONS, exact routes used by this app, exact allowed browser origins, and no query strings are accepted. Unknown paths and URL injection fail before credentials are accessed. TTLs: timetables 300s (separate Taiwan-day keys), delays 30s, metro input 24h, alerts/flights 60s. Tokens and concurrent data requests are shared within an isolate. Cache timestamps reflect the upstream retrieval, not cache hits. Edge cache never stores tokens. Requests use 20s upstream deadlines and a 16 MiB streamed response cap. Provider failures return a generic 502; absent configuration/limiter returns 503. No raw upstream body or credential is logged or returned on failures.

CORS is browser isolation, not authentication: nonbrowser callers can forge Origin, so rate limiting remains mandatory. The Worker does not expose a token endpoint or general URL proxy. Do not enable wildcard CORS. Keys are never shipped in static output. Personal direct-TDX mode remains optional for compatibility; its existing browser storage is **not** a safe secret vault. Avoid it on shared devices and use the proxy for public use.

Tests: `node --test tests/proxy.test.cjs` (no account or real credentials required).
