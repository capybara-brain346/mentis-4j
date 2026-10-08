# Worker authentication release record

Status: authenticated Worker deployed with verified AuraDB connection settings on 2026-10-08. All 46 tests passed, including database-backed tests; none were skipped. Public authentication checks passed. Full release validation is incomplete: no live Google sign-in or authenticated memory operation through the deployed Worker was verified.

## Shared environment

| Item | Value |
| --- | --- |
| Account | `32f2a5e2a676ee905a3828b2b38b0150` |
| Worker | `mentis-4j` |
| Origin | `https://mentis-4j.choudhari-piyush.workers.dev` |
| Entry point | `src/mcp/server/server.ts` |
| Compatibility date | `2025-03-01` |
| Previous version | `6c53cba1-9ee9-4183-9a29-1adfb0c08de4` |
| Deployed version | `f2cc0a20-9efe-4ca4-8068-8a131d3d684d` (100% traffic) |
| AuraDB URI | `neo4j+s://84372ed8.databases.neo4j.io` |
| AuraDB username/database | `84372ed8` / `84372ed8` |
| D1 binding | `DB`, database `mentis-auth` |
| D1 ID | `145233ff-cd70-42a6-a2d3-e0e87e3a1c1a` |
| KV binding | `OAUTH_KV`, namespace `mentis-oauth` |
| KV ID | `61436524761a42098f0fb6ebffe3f3a8` |
| Browser-session lifetime | `604800` seconds (seven days); deployed |
| Access-token lifetime | `600` seconds |
| Grant deadline | Seven days after the first token exchange; refresh does not advance it |

Wrangler 4.141.0 is authenticated. Worker, D1, and KV write permissions were checked. Resource inventory was checked before creation. The previous Worker version had no bindings or observability configuration. No Mentis custom domain was found. The deployed version has the configured D1/KV bindings, three secrets, logs, sampled traces, and query-string redaction. Its workers.dev endpoint is enabled; version previews are disabled.

D1 and KV were created through project-local Wrangler. Remote migration `0001_oauth.sql` was applied at `2026-10-08 06:24:39` UTC. Schema inspection confirmed the tables, unique workspace owner, consent foreign keys, and migration ledger. `PRAGMA foreign_key_check` returned no violations. A second migration check found no pending migration. The OAuth KV namespace is empty. No account or memory data was written by these preparation steps.

## Corrected deployment at 07:09 UTC

The local AuraDB URI and credentials authenticated successfully. Database discovery reported `84372ed8` as the online home database; `neo4j` did not exist. The user corrected `NEO4J_DATABASE` in both local files. The URI, username, and database were added to `wrangler.jsonc`.

The OpenRouter key in `.dev.vars` returned 401 during integration tests. The key in `.env` passed the same tests. The working key was copied into `.dev.vars`, and release secrets were read from `.env` for the next upload. No secret values were printed. The protected temporary secrets file was removed after deployment.

Typecheck, repository checks, build, and Worker dry run passed. `node --env-file=.env --test tests/*.test.js` passed all 46 tests with no skips. The graph and stdio integration tests exercised live AuraDB and OpenRouter: record, search, recall, correction, and deletion passed. Scoped cleanup removed the test records. These are local-process checks against the live providers, not deployed-Worker memory checks.

No D1 migrations were pending. Code, corrected configuration, and secrets were uploaded together. Version `f2cc0a20-9efe-4ca4-8068-8a131d3d684d` received 100% traffic at `2026-10-08T07:09:41.334Z`. Live checks returned 200 for root and OAuth discovery and 401 with a resource-metadata Bearer challenge for anonymous MCP requests.

Real Google sign-in, authenticated Worker memory requests, two-user isolation through the deployed Worker, and live disconnect/logout still require verification. The earlier database and OpenRouter failures below are historical, not current blockers.

## First deployment on 2026-10-08

The user requested deployment after updating the local files. Inspection still found `NEO4J_URI=bolt://127.0.0.1:7687` in both `.env` and `.dev.vars`. No AuraDB URI was uploaded. The Worker still uses its localhost fallback. This limitation was reported before deployment; memory operations are not ready.

The Google redirect preflight reached Google's sign-in page without `redirect_uri_mismatch` or `invalid_client`. This checks registration only, not a real account sign-in.

A clean build, typecheck, repository check, Worker dry run, and local tests passed again: 44 passed, two database-backed tests skipped. The three secrets were read from `.dev.vars`, which is the Worker development file. Its OpenRouter key differs from `.env`; the `.dev.vars` value was used. Secrets were uploaded with code through a permission-restricted, ignored `.env.release` file. That temporary file was removed after upload. Secret values were not printed.

Deployment completed at `2026-10-08T06:55:35.073Z`, with 100% traffic on `fe05dd2c-b8ea-4eb9-a579-c569c94d8f53`.

| Live check | Result |
| --- | --- |
| `/` | 200 |
| `/.well-known/oauth-authorization-server` | 200; endpoint URLs matched the origin |
| `/.well-known/oauth-protected-resource/mcp` | 200; MCP resource and authorization server matched |
| Anonymous `POST /mcp` | 401 with Bearer resource-metadata challenge |
| Anonymous `/account` and `/connections` | 401 |
| `/google/callback` without state | 400 |
| `/authorize` without a valid request | 400 |
| Deployed secrets | Google client secret, Neo4j password, OpenRouter key present |
| Deployed observability | Logs enabled; traces sampled at 0.01; query-string redaction enabled |

No authenticated live memory request, two-user isolation test, real disconnect/logout sequence, or captured-log secret inspection was performed. The logger's `process.env` compatibility issue from the subsequent review is also unchanged.

The following preparation checks and failures are historical. Current remaining work is to provide the AuraDB URI, verify database readiness, and complete the real-account/MCP checks in the resume procedure.

## Completed local work

- Repaired the five process-server imports and the emitted process entry-point callers.
- Passed a plain parameter object to the forget-attempt transaction.
- Replaced obsolete database imports and arbitrary-Cypher recall tests with the AuraDB and structured recall contracts.
- Gave database tests distinct identities and restricted cleanup to their records.
- Kept row and byte limits. Added a JSON-size boundary test and included the recall wrapper in the byte count.
- Added Worker checks for the seven-day consent deadline, unchanged deadline after refresh, refresh-token rotation, and active user/workspace checks on access and refresh.
- Added local schema checks that all memory tools reject workspace overrides and recall rejects arbitrary Cypher.
- Kept the existing rejection of narrowed token scopes. The intended MCP client's scope behavior remains unverified.
- Configured full log sampling, one-percent trace sampling, and query-string redaction. Browser and outer Worker error logs use fixed messages rather than exception text.
- Regenerated `worker-configuration.d.ts` with Wrangler.

```text
Clean source -> Type check -> Repository check -> Build -> Worker dry run
                                                        |
                                                        v
                                                   Local tests
```

| Check | Result |
| --- | --- |
| Clean generated build | Passed; old `dist/` was removed before the first build |
| `npm run typecheck` | Passed |
| `npm run check` | Passed |
| `npm run build` | Passed |
| `npm run worker:build` | Passed; packaging only, no deployment |
| `npm test` | 44 passed, zero failed, two database-backed tests skipped |
| Tests with `.env` exported | 43 passed, two failed on database connectivity; zero skipped |
| Direct database connection | Failed with `ServiceUnavailable` |
| Remote D1 migration/schema checks | Passed |
| Google redirect preflight | Response contained `redirect_uri_mismatch` |

Local Worker tests use workerd, local D1/KV, and Google fixtures. Authorized MCP access reaches the expected database-configuration error. These checks do not prove successful memory operations in the deployed Worker. Deadline and forced-expiry checks use local fixtures; no seven-day elapsed-time test was performed.

## Blockers found during preparation

1. Both `.env` and `.dev.vars` contain `NEO4J_URI=bolt://127.0.0.1:7687`, not an AuraDB URI. That endpoint refused the connection. The plan's stated AuraDB configuration is not present in these files. Supply the shared AuraDB connection settings through approved local storage. Keep the password out of source control and chat. Add the verified URI to `wrangler.jsonc` variables; confirm username and database. Do not deploy the localhost URI.
2. Register this exact Google web-client redirect URI:

   ```text
   https://mentis-4j.choudhari-piyush.workers.dev/google/callback
   ```

   Verify audience and test-user access in Google settings. Local credential fields are present, but their validity and a real sign-in are not verified.
3. Identify the intended MCP client and check its authorization and refresh scope requests. Do not weaken the access check without defining permissions.
4. Inspect AuraDB constraints, similarity support, and unowned legacy data. Back up and review data before removing global constraints. Do not assign unknown data to an owner.

The existing endpoint was inspected without authentication: `/` and both discovery endpoints returned 404. `POST /mcp` returned 503, `Mentis database is not configured`, without a Bearer challenge. This is the old deployment, not validation of the prepared release. It is not an approved rollback target.

## Resume release

After the blockers are resolved:

1. Export the verified AuraDB and OpenRouter settings into the test process. Repeat the full checks. Review test cleanup queries before running against shared data.
2. Recheck the account, deployment, D1/KV IDs, migrations, and endpoint triggers. Record AuraDB backup/recovery details and a fresh D1 Time Travel bookmark.
3. Prepare an ignored, permission-restricted `.env.release` containing only `GOOGLE_CLIENT_SECRET`, `NEO4J_PASSWORD`, and `OPENROUTER_API_KEY`. Never print or commit its contents.
4. Regenerate types and repeat `npm run worker:build`.
5. Upload code and secrets together:

   ```sh
   npm exec -- wrangler deploy --secrets-file .env.release
   ```

6. Record the returned URL and version ID. Confirm that all traffic uses the authenticated version.
7. Use a real Google account and the intended MCP client. Verify consent, Cancel, existing sessions, invalid/repeated callbacks, refresh, disconnect, logout, and session expiry. Verify discovery and a 401 Bearer challenge for anonymous MCP access.
8. Run all memory tools with two test users that use the same repository/task identities. Check isolation and rejected workspace arguments. Deactivate only test records, check access/refresh rejection, and remove test memory.
9. Inspect captured logs and traces for secret fields. Verify Worker-to-AuraDB connectivity and OpenRouter use. Record a successful authenticated memory request before marking the release complete.

```text
MCP client -> OAuth token validation -> D1 active-access check
                                                  |
                                                  v
                                      Verified workspace ID
                                                  |
                                                  v
                                      Fixed AuraDB query -> MCP response
```

## Recovery

No fully validated authenticated rollback version exists yet. The current version passes public authentication checks and local database-backed tests, but its deployed memory path is not verified. Do not roll back to the old binding-free version. If the first release fails, withdraw its public endpoint rather than remove authentication:

- Set `workers_dev` and `preview_urls` to `false` in `wrangler.jsonc`.
- Remove any Mentis routes/custom domains found during the pre-release trigger inspection from the desired configuration.
- Apply the endpoint changes with `npm exec -- wrangler triggers deploy --name mentis-4j`.
- Verify that every former public endpoint is unavailable. Keep D1, KV, and AuraDB intact.

After a compatible authenticated version passes live checks, record its actual version ID and the recovery command:

```sh
npm exec -- wrangler rollback VERSION_ID --name mentis-4j
```

The deployed version can be restored in a later deployment with:

```sh
npm exec -- wrangler rollback f2cc0a20-9efe-4ca4-8068-8a131d3d684d --name mentis-4j
```

This restores the checked authentication boundary and the corrected provider configuration. It is not an approved recovery target for deployed memory operations until those operations pass live checks.

Worker rollback does not restore database or KV data.

The empty, migrated D1 database had this bookmark at preparation time:
`00000000-0000000c-000050fe-88e507c12b574072debe72225086909d`.
A new pre-deployment bookmark was recorded:
`00000004-00000000-000050fe-8cc6188a45acfefc62a37fcdbf61b099`.

Neither bookmark is a permanent backup. Restoring an empty preparation state after accounts exist would remove those accounts. Use a fresh, approved recovery point for an incident:

```sh
npm exec -- wrangler d1 time-travel info DB
npm exec -- wrangler d1 time-travel restore DB --bookmark APPROVED_BOOKMARK
```

No KV restore or AuraDB backup was performed. Recover KV only from an approved backup; otherwise revoke affected D1 consents and require fresh sign-in. Recover AuraDB through its verified provider backup procedure. Keep recovered consent/token state consistent so revoked grants do not regain access.

References: [secrets upload](https://developers.cloudflare.com/workers/configuration/secrets/#upload-secrets-alongside-code), [observability](https://developers.cloudflare.com/workers/wrangler/configuration/#observability), [D1 Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/), [Worker rollback limits](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/).
