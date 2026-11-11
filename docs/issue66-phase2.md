# Issue #66 phase 2: optional secure TDX proxy

Stacked on `feat/66-data-provenance`. Adds a Cloudflare Worker with fixed endpoint allowlist, bounded upstream deadlines/size, shared token/data requests, source-aware edge TTL caching, exact CORS and mandatory managed rate limiting. Errors never return upstream bodies. Server credentials are only Worker secrets. Adds a keyless client mode for rail, metro, flights and alerts, while retaining optional personal mode. Documents browser-storage risks and deployment/rollout steps.

Validation: 24 Node tests passed, including route/URL injection rejection, limiter failure, cache TTL/day rollover, duplicate requests, secret/error-body protection and client keyless transport. Desktop/mobile focus smoke flows pass without page errors against controlled empty tile fixtures. Build and JavaScript syntax pass.

Not deployed: no Cloudflare account/production TDX secrets are configured in this environment. Real provider auth, account rate-limit binding support and production CORS must be validated by the site operator before rollout. Estimated mode remains the default until a proxy is configured. See `proxy/README.md`.
