# Frontend account integration deployment

Deployed `mentis-4j` at `2026-10-08T11:39:35Z`, with 100% traffic on version `728d5948-7a94-49eb-baaa-6eae9ebb8609`.

- Worker: `https://mentis-4j.choudhari-piyush.workers.dev`
- Frontend: `http://127.0.0.1:6969`, selected by the user.
- Existing D1/KV bindings, AuraDB settings, and three secrets were preserved. No migrations were pending or applied.
- `wrangler.jsonc` now sets `FRONTEND_BASE_URL`; Wrangler regenerated binding types.
- The ignored `frontend/.env.local` configures Next with the Worker and frontend origins. The running Next server loaded it; its account proxy reached the deployed Worker.

The first upload (`ddbe4359-dc75-4983-a88a-9e82284ce734`) used an unregistered frontend Google redirect and failed the registration preflight. The current version uses the already registered Worker `/google/callback` URI for both browser and MCP sign-in. Browser sign-in state has a separate prefix. The Worker sends its callback parameters to the fixed frontend callback; the frontend then returns them with its HttpOnly state cookie for validation and exchange. No session secret or token is sent in that redirect.

```text
Local browser -> Next -> Worker -> Google
Local browser <- Next <- Worker callback <- Google
                 |
                 v
             Worker validates cookie-bound state and Google identity -> D1 session
```

Typecheck, repository checks, build, Worker dry run, and tests passed: 44 tests passed; two Neo4j-backed tests skipped. Live checks passed for discovery, anonymous account APIs, the local frontend proxy, cross-origin POST rejection, callback relay, and the anonymous MCP Bearer challenge. Google's registration preflight reached sign-in without `redirect_uri_mismatch` or `invalid_client`.

A real Google account sign-in and authenticated deployed memory operations were not checked. Registration preflight is not account authentication. Preflight created short-lived sign-in transactions; no account or memory data was created by those checks.

Setup and behavior: `frontend/AUTH.md`.
