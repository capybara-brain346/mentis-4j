# Paired Lite benchmark handoff

## Cancelled run — 2026-10-07

- The user stopped the benchmark because of usage. Do not restart, run more coding trials, or grade patches without a new user request. Saved files were retained. The benchmark's agent container, database container, network, and volume were removed.
- Corrected run: `.data/cohort-20261007-investigation/run-2026-10-07T133007663Z/`, former runner PID `120581`. The launcher recorded `SIGTERM` at `2026-10-07T14:02:00.754Z`. Seven experience trials finished with exit 0 and patches. Astropy failed its pytest image check because `erfa` was absent. Task 9, `pytest-dev__pytest-7490`, was interrupted. No pilot or target trial ran. All seven local searches returned zero candidates; all seven local records succeeded. No connected app calls occurred in the completed corrected-run traces.
- Completed trials across the earlier and corrected runs reported 8,872,425 input tokens (8,154,368 cached, already included) and 119,970 output tokens. These totals exclude interrupted tasks and other session work. They are not a bill. There is no baseline versus Mentis result.

- Update from the authorized rerun: OpenRouter key check passed. The live graph and stdio checks passed (2 tests, no failures or skips) against a separate database. Two test assumptions were corrected: recall checks now use returned column names, and graph search is checked before the useful record is deleted. Runtime code and benchmark settings were unchanged.
- Stopped run: `.data/cohort-20261007-investigation/run-2026-10-07T123720277Z/`, former runner PID `79893`. The official grader gate passed. Six experience trials finished with exit 0 and patches; task 7 was interrupted. No target trial ran. Pinned CLI feature inspection confirmed apps were enabled. Experience traces attempted remote `codex_apps/mentis_4j.*` calls despite the local MCP server check. Stop signal was `SIGTERM`; owned agent, database, network, and volume were removed. Keep the saved artifacts. A fresh run must disable connected apps and verify that setting before every trial. Do not reuse this run for the corrected comparison.
- Final partial results and check evidence are recorded in `docs/experiments/mentis-benchmark-results-2026-10-07.md`. The saved patches were not independently graded. No target benefit or failure rate can be inferred.

The following notes describe historical setup before this rerun. Access and key checks later passed. These notes do not authorize a restart.

- The user authorized a new run and requested `gpt-6-luna` with `xhigh` reasoning for the test coding agents. Both arms use those settings with pinned Codex CLI `0.156.1` in isolated containers.
- The old ignored cohort and evaluator checkout were absent on this machine. The existing benchmark source was retained. Pinned downloads were restored and the cohort was regenerated with the original seed `20260924`.
- Prepared cohort: `.data/cohort-20261007-investigation/` (50 experience tasks, 17 targets, 33 eligible targets).
- Evaluator: `.data/evaluator/`, verified at `12ad6ab14e18e9378e1e293c9edbc3f7ce43d27b`.
- Stopped setup run: `.data/cohort-20261007-investigation/run-2026-10-07T120553024Z/`. The first agent image failed at `npm ci` because the Wrangler declaration and lock differed. One infrastructure failure was recorded before any coding trial. The runner was stopped; its owned database, network, and volume were removed. Keep these artifacts and start a new run directory.
- The dependency lock now matches the existing `wrangler: ^4.141.0` declaration. A fresh source-only Docker build passed `npm ci`, compilation, and CLI installation. Image `mentis-agent:cd202a93077e1287` passed Node, Codex, and server-path checks.
- The known-correct grader gate resolved its one task. The empty submission did not resolve it. A separate pinned-CLI model probe returned `READY` with the requested model and effort. No coding trial or target score is available yet.
- Live graph and stdio MCP checks used a separate disposable database. Both failed before storage because OpenRouter returned HTTP 401 (`API key expired`). The user then replaced the key in `.env`. Its presence is confirmed, but its validity is not yet verified.
- The session changed to managed access after the key update. A network check failed with `EAI_AGAIN`; Docker access failed with permission denied on `/var/run/docker.sock`. These are current launch blockers. Do not report the updated key as working or the benchmark as running.
- Resume from the repository root with `node swe-context-bench-lite/.data/resume-run.mjs` when network and Docker access are available. The private script checks the updated key, tests live record/search/recall against a disposable database, removes that database, and starts the existing launcher only if the checks pass. The launcher keeps the original 50/17 cohort, model, effort, and limits. Its new run directory and PID are printed. Do not launch a duplicate run.
- The MCP config path was corrected to `dist/process/server.js`. Raw JSONL is retained unchanged; separate `.timing.json` files record stdout receipt times and byte offsets. Timing is a receipt proxy, not exact command execution time.
- Investigation rules were fixed before target results in `docs/experiments/mentis-investigation-protocol-2026-10-07.md` and copied into the run. Six targets have provisional investigation labels. Report the complete cohort and the exploratory subgroup separately.
- Two read-only subagents checked setup and scoring. No static launch blocker was found. Fixed baseline-first order, one attempt per arm, required retrieval, and subjective trace review limit claims. Their findings are recorded in `setup-audit.json`.
- Benchmark TypeScript compilation and 9 Node tests passed. The Python preparation and trace checks passed (6 tests). Root build/tests passed with 23 passed and 2 database tests skipped; lint and format passed. The later live database checks failed as stated above. A first Python test command from the repository root failed to import `prepare`; the documented command from the benchmark directory passed.
- `investigation.py` extracts completed command/MCP counts and visible event references from raw traces. It excludes pilot trials from standard totals and preserves missing timing and token data. Run `python3 swe-context-bench-lite/investigation.py <finished-run-directory>` after the run. Do not treat failed commands as wasted investigation. Manual diagnosis and repeated-path review remains required.

```text
Valid key + Docker access -> Live memory checks -> New 50/17 run
                                 |
                              failure -> Stop; retain check log
```

The remaining sections describe the earlier September run and its historical paths. They are not the current runtime state.

## Goal

Finish the SWE-ContextBench Lite paired-subset experiment: run 50 experience tasks, freeze the resulting Mentis DB, pass the linked experience→target pilot in baseline and Mentis arms, then run 17 targets in both arms and grade predictions with the pinned evaluator's released `evaluation.sh`. Produce per-target outcomes and artifacts. Do not claim completion before the pilot and cohort finish.

## Current state

- Repository: `/home/capybara/code/mentis-4j`, branch `main`. Benchmark source is under `swe-context-bench-lite/`; generated datasets, credentials, and partial runs are ignored under `.data/`.
- Prepared cohort: `.data/cohort-20260924-175019-gpt-6-luna-xhigh/` (50 experiences, 17 targets; seed 20260924; Codex `gpt-6-luna` at `xhigh` effort)
  - 50 experience task IDs; 17 distinct targets.
  - 33 targets eligible under strict `experience.created_at < target.created_at` when both dates exist.
  - 14 unique linked experience IDs across 17 pairs; 36 explicit distractors.
  - All selected pair dates are present and strictly ordered. The date field is the dataset PR `created_at` timestamp, not necessarily the underlying GitHub issue creation date.
- The most recent run lost its Docker Desktop connection during experience task 5. Only 4/50 experiences completed; the remaining 46 were recorded as infrastructure failures. No DB freeze, pilot, target arms, or final report followed. All partial run directories, logs, and PID files have been discarded.
- Older prepared `gpt-5.3-codex` cohorts are retained under `.data/cohort-20260924-16????-gpt-5.3-codex-*/` (timestamps are manifest modification times in local machine time), but their partial runs have also been discarded. Do not merge these cohorts with the current model.

## Code and docs

The runner is implemented in `prepare.py`, `execute.ts`, `grade.ts`, `run.ts`, and tests under `tests/`. `HANDOFF.md` is this resume note. `.data/` contains ignored datasets, task manifests, logs, auth, and incomplete run artifacts; keep secrets and generated data out of Git.

Experience tasks have no published SWE-ContextBench target images. The runner builds them from the pinned evaluator checkout's `build_base.py` / `build_instance.py`, passing only task ID, repository, base commit, and date—no patches. Target tasks use the published hardened images. Both target arms reuse the same built image and exact base commit.

The evaluator checkout is expected at `/tmp/tmp.Bp0i1zSPpD/repo`, pinned commit `12ad6ab14e18e9378e1e293c9edbc3f7ce43d27b`. Verify it still exists and has that commit; otherwise clone/check out the pin.

## Execution status

The user explicitly switched the experiment to `gpt-6-luna` with `xhigh` reasoning effort. The manifest validator pins both; the runner passes `--model gpt-6-luna -c model_reasoning_effort="xhigh"`. A real one-turn request succeeded locally and in the agent image using the existing dedicated Codex home. TypeScript compilation, 5 Python tests, 9 Node tests, and Prettier checks passed. The previous model's HTTP 400 is no longer blocking.

The container uses a UID/GID-owned writable tmpfs at `/codex-home`, writable host `auth.json`, read-only host `config.toml`, and a writable task checkout at `/testbed`. The audit checks three exact bind mounts in Docker `.Mounts` and the UID/GID-owned tmpfs in `.HostConfig.Tmpfs`, recording both.

## Resume sequence

1. Do not restart the benchmark without a new user request. Never print or commit the dedicated auth file.
2. Verify Docker Desktop is reachable. If requested later, use `.data/cohort-20260924-175019-gpt-6-luna-xhigh/manifest.json` with a **fresh** run directory named `run-$(date +%Y%m%d-%H%M%S)` (local machine time) under that cohort after sourcing `.env` without printing the key. The runner performs all 50 experience tasks, snapshots the DB, performs the linked pilot in both arms, and only then starts the 17-target cohort. Stop if the pilot/container audit or DB immutability check fails.
3. On success, inspect the new run's `report.md` and `report.json`, official grader output, `experience-db-verification.json`, `phase-gate.json`, `target-db-audit.jsonl`, and attempt artifacts. Report unavailable token fields as null, not zero.

Do not compare this 17-target subset's resolved count as a percentage against the paper's full 99-task cohort.
