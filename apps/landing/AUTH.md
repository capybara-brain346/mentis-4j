# Account integration

The account console uses the Worker for Google identity, D1 sessions, workspace ownership, client access, disconnect, and logout. The Next server forwards these requests through `/api/auth/*`. Browser code receives account data, not Google tokens or session secrets.

```text
Browser -> Next /api/auth/sign-in -> Worker /api/sign-in -> Google
Google  -> Worker /google/callback -> Next /api/auth/callback
                                     |
                                     v
                              Worker /api/google/callback
                                     |
                                     v
                              D1 session -> HttpOnly cookie -> /account

Browser -> Next /api/auth/account     -> Worker /api/account -> D1
Browser -> Next /api/auth/connections -> Worker /api/connections -> D1 + OAuth provider
Browser -> Next /api/auth/disconnect  -> Worker /api/connections/disconnect -> revoke grants
Browser -> Next /api/auth/logout      -> Worker /api/logout -> revoke browser session
```

## Configuration

1. Set `MENTIS_BACKEND_URL` in the Next server environment (or `apps/landing/.env.local`). Use the Worker's canonical origin, without a path:

   ```dotenv
   MENTIS_BACKEND_URL=https://mentis-4j.choudhari-piyush.workers.dev
   FRONTEND_BASE_URL=https://mentis.example
   ```

2. Set the same `FRONTEND_BASE_URL` in the Worker environment. Use the frontend's exact origin, such as `https://mentis.example`. Keep `PUBLIC_BASE_URL` set to the Worker's canonical origin. Deploy the updated Worker code and configuration. No D1 schema change is needed; the existing `auth_transactions` table stores short-lived browser sign-in requests.
3. Keep the existing Google web-client redirect URI:

   ```text
   https://mentis-4j.choudhari-piyush.workers.dev/google/callback
   ```

   Both browser and MCP sign-in use this registered Worker callback. Browser sign-in then returns through the frontend callback, where its HttpOnly state cookie is checked. No additional Google redirect registration is needed. Set the appropriate Google test users and audience. Keep `GOOGLE_CLIENT_SECRET` in Worker secrets only.
4. Restart the Next server after changing its environment. Use HTTPS in production. Loopback HTTP origins are accepted for local checks. Use the same hostname and port in `FRONTEND_BASE_URL`, the browser, and the Google redirect registration.

For a local frontend at `http://127.0.0.1:6969`, set `FRONTEND_BASE_URL=http://127.0.0.1:6969` on Next and the Worker. A local Worker must also use its local origin as `PUBLIC_BASE_URL`; point `MENTIS_BACKEND_URL` to that origin. Do not put local origins in production configuration.

The deployed Worker currently uses `http://127.0.0.1:6969` for the user's local frontend. The local `apps/landing/.env.local` points Next to that Worker. This is a local development connection, not a deployed public frontend.

Missing backend configuration and provider failures show a retry message. They never create an example session as a substitute for live sign-in.

## Security and behavior

- Browser API requests stay on the frontend origin. Google navigation uses the registered Worker callback, which sends browser sign-in requests to the fixed frontend callback. No session cookie or token is transferred in that redirect. No cross-origin browser cookies or permissive CORS rules are needed.
- Next checks the browser's Origin against its configured frontend origin on POST before it forwards the backend Origin. It does not use the Next listener's internal URL as the browser origin. The Worker still checks Origin and session ownership before disconnect and logout.
- Next forwards only Mentis session and sign-in cookies. Responses are not cached. Cookies retain `Secure`, `HttpOnly`, `SameSite=Lax`, and the `__Host-` prefix.
- Browser sign-in uses a cookie-bound random state, PKCE, and a nonce. D1 consumes the sign-in request once and rejects expired requests. The Google adapter verifies the signed ID token and verified email.
- Live connections list current, unrevoked client access. The server resolves registered client names; those names are not verified identities. No example clients are added to a live account.
- Logout ends the browser session, not client grants. Disconnect revokes all grants and consents for the selected client without deleting memory.
- The example workspace remains an explicit local preview. Preview disconnect and logout do not change live access, even when a live session exists.
- Live MCP consent remains on the Worker. The frontend `/authorize` page forwards non-preview client requests to the Worker when the backend is configured. MCP tokens and discovery endpoints remain on the Worker origin. Browser sessions are host-specific: a frontend sign-in does not also set a cookie on the Worker host.

## Callback call-stack change

```text
Before:
handleBrowserSignIn -> createGoogleAuthorizationRequest(frontend callback)
Google -> frontend callback [blocked by Google registration]

After:
handleBrowserSignIn -> createGoogleAuthorizationRequest(Worker callback) [rerouted]
Google -> handleGoogleCallback -> frontend proxy -> handleBrowserCallback [added]
handleBrowserCallback -> exchangeGoogleCode(Worker callback) [rerouted]
MCP callback -> handleGoogleCallback -> finishGoogleSignIn [unchanged]
```

## Checks

```sh
npm run typecheck
npm test
npm --prefix apps/landing run typecheck
npm --prefix apps/landing run test:auth
npm --prefix apps/landing run check:account
```

The Worker tests use Google fixtures and local D1. The account browser check starts a Next server and a backend fixture. It checks cookie forwarding, account reload, disconnect failure and retry, logout, preview separation, and desktop/mobile accessibility. These checks do not verify a real Google account or a deployed service.
