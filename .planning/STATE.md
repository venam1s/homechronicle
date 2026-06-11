---
gsd_state_version: 1.0
milestone: v1.4
milestone_name: Multi-User Auth & Email
status: executing
stopped_at: Phase 20 complete — UAT 4/4 PASS, verified
last_updated: "2026-06-11T17:01:00Z"
last_activity: 2026-06-11 -- Phase 20 UAT complete (4/4 PASS, 0 issues); phase verified
progress:
  total_phases: 4
  completed_phases: 1
  total_plans: 13
  completed_plans: 13
  percent: 25
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-28)

**Core value:** A reliable, maintainable codebase that self-hosted users can trust to run unattended for months without performance degradation or silent failures.
**Current focus:** Phase 21 — Email Infrastructure + Invites + Password Reset

## Current Position

Phase: 20 (auth-foundation) — COMPLETE (UAT 4/4 PASS, verified 2026-06-11)
Next: Phase 21 — Email Infrastructure + Invites + Password Reset (not yet discussed/planned)
Status: Phase 20 complete; ready to start Phase 21
Last activity: 2026-06-11 -- Phase 20 UAT complete (4/4 PASS, 0 issues); phase verified

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.

- Mirror setup-router.js manual repair order in scheduler: resetSubscriberStats → stopSubscriber → startSubscriber, applied to both needsRepair and isStale success branches
- Inject performPairSetupAndPersist as a pre-wired 4-arg closure into scheduler rather than threading HttpClient + savePairings — minimizes dep surface and matches existing discoverDevice injection pattern
- no-PIN skip runs before discoverDevice to avoid unnecessary mDNS churn for unrecoverable devices
- [Phase ?]: csrf-sync 4.2.1 does NOT await storeTokenInState — Strategy B for Plans 08/09: sync req.hcSession.csrfToken + lazy DB flush

### Pending Todos

None — roadmap created, proceed to `/gsd:plan-phase 20`.

### Blockers/Concerns

None.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260427-ttq | Fix everything-stale bug: add lastHealthyAt heartbeat to subscriber stats; thread into deriveDeviceHealth + getRepairTargets | 2026-04-28 | 02a21cb | [260427-ttq-fix-everything-stale-bug-add-lasthealthy](./quick/260427-ttq-fix-everything-stale-bug-add-lasthealthy/) |
| 260427-vch | Close quiet-device gap: thread subscriberConnected boolean into deriveDeviceHealth rescue (live HAP sub = heartbeat) | 2026-04-28 | 725a905 | [260427-vch-close-quiet-device-gap-thread-subscriber](./quick/260427-vch-close-quiet-device-gap-thread-subscriber/) |
| 260427-wm1 | Fix release blockers from RELEASE-REVIEW: KpiCards window coherence (H-01/H-03), EventRow a11y (H-02), subscriber liveness gate (M-01) | 2026-04-28 | 3ffc42e | [260427-wm1-fix-release-blockers-from-release-review](./quick/260427-wm1-fix-release-blockers-from-release-review/) |
| 260515-nfw | Silence matter.js DEBUG log firehose at startup (MATTER_LOG_LEVEL/MATTER_LOG_FORMAT env vars; defaults INFO/PLAIN) | 2026-05-15 | c60ea26 | [260515-nfw-silence-matter-js-debug-log-firehose](./quick/260515-nfw-silence-matter-js-debug-log-firehose/) |
| 260528-0it | Patch dnssd@0.4.1 readFQDN with compression-pointer cycle guard + 128-iteration budget via patch-package (v0.1.11) — fixes prod listener CPU peg from malformed mDNS packet | 2026-05-28 | 890f9a0 | [260528-0it-patch-dnssd-fqdn-parser-cycle-guard](./quick/260528-0it-patch-dnssd-fqdn-parser-cycle-guard/) |
| 260601-t3z | Add 7 optional ("extra") dashboard panels (off by default, added via customize tray): WeekOverWeek KPIs, Health donut, Alerts summary, Top movers, Activity clock, Quiet-hours compliance, Room sparklines + `optional` flag with first-seen hidden-seeding in useDashboardLayout | 2026-06-01 | fa7a814 | [260601-t3z-add-7-optional-dashboard-panels-extras-h](./quick/260601-t3z-add-7-optional-dashboard-panels-extras-h/) |
| 260601-wsv | Dashboard panel fixes: CSS-driven Quiet Hours gauge theming (fill + track via .hc-gauge rules, drop useStatusColors); replace Activity Clock with Day vs Night donut; right-size Week over Week (h:3→2 + fill); fix inverted Top Movers color (dropoff=danger/pink, spike=success/green); icon-only Customize button. Verified light+dark in browser | 2026-06-02 | c2f59f4 | [260601-wsv-fix-quiet-hours-gauge-theme-css-driven-f](./quick/260601-wsv-fix-quiet-hours-gauge-theme-css-driven-f/) |
| fast | Cap Week over Week panel maxH:2 (plumbed through layout builders + sanitize clamp + applyLayoutChange) so previously-saved oversize (h:3) layouts auto-clamp to 2 rows on load — no manual resize. Verified in browser: stored h:3 → rendered 144px (2 rows) | 2026-06-02 | e3f34a3 | — |
| 260602-nb9 | UI: standardize list/detail pages to a medium centered column (PageContainer `narrow` → max-w-4xl; default stays max-w-6xl so Dashboard grid is untouched); drop the redundant white Card wrapping Devices Browse + collapse AccessoryList inner max-w-2xl (kills the big-white-box gutters); move Timeline Search&filters + Activity-heatmap toggles into the header (remove the edge-to-edge white FilterBar strip), all Timeline sections aligned to max-w-4xl. Net-new FilterBar.test.jsx. Browser-verified light+dark (toggles left-align with title, delta 0). 156 web tests pass | 2026-06-02 | (nb9-01) | [260602-nb9-standardize-page-width-to-medium-centere](./quick/260602-nb9-standardize-page-width-to-medium-centere/) |
| 260603-v3f | Security & vulnerability remediation batch (grype scan + full-tree audit): (1) lockfile-faithful `npm ci` in all Docker stages; (2) web picomatch 4.0.3→4.0.4 (GHSA-c2c7-rcm5-vvqj ReDoS); (3) web nginx base alpine3.21→1.30-alpine (CVE-2026-42945 crit +4 high); (4) drop curl/dns tools from listener+web runtime (3 unfixable curl highs each); (5) block IPv6-mapped IPv4 literal SSRF bypass (`::ffff:7f00:1`); (6) redact webhook target_url in GET /alerts/rules; (7) bound /alerts/deliveries page param; (8) cap+transactional /matter/events bulk insert; **(9) listener picomatch→2.3.2 override** (npm audit proved npm ci alone left 2.3.1 vulnerable — earlier "free fix" claim was wrong); **(10) Alerts edit-flow fix** (redaction had blanked the required URL field, blocking edits/clobbering the stored webhook). 355 listener + 159 web tests pass; lockfiles verified in sync. NOTE: CVE clearance pending image rebuild + grype re-scan (Docker was down). | 2026-06-04 | a6ce5bb..2756d30 (10) | [260603-v3f-security-vulnerability-remediation-batch](./quick/260603-v3f-security-vulnerability-remediation-batch/) |
| 260602-l4c | Add one-shot in-stack `db-sync` service to docker-compose.beta.yml: refreshes beta Postgres from a prod snapshot before the listener starts on each (re)created deploy. New POSIX-sh `docker/beta-db-sync.sh` (pg_dump prod READ-ONLY \| psql beta --clean, display-config copy, never pairings, SYNC_REQUIRED best-effort policy). Uses network_mode: host (prod pg is loopback-only, unreachable via bridge/host-gateway on Linux). listener depends_on db-sync service_completed_successfully. CRITICAL: deploy must recreate db-sync (restart:no one-shot) or refresh no-ops. Static-verified only (no host docker/prod DB from Mac) | 2026-06-02 | (l4c-01) | [260602-l4c-add-one-shot-in-stack-db-sync-service-to](./quick/260602-l4c-add-one-shot-in-stack-db-sync-service-to/) |
| fast | Make beta-sync cron-robust: prepend known-good PATH in sync-beta-auto.sh + sync-prod-to-beta.sh (cron's minimal PATH couldn't find bare `docker`/`flock`/pg → container-wait timeout → silent abort); fall back from root-only /var/log to repo-local .beta-sync.log (gitignored) then $TMPDIR instead of /dev/null so unattended runs always leave evidence. bash -n + log-fallback runtime verified | 2026-06-02 | 805f86d | — |
| 260602-g92 | Add 5 Tier 2 optional dashboard panels (off by default, OPTIONAL_PANEL_IDS 7→12): Sensor Environment, Battery Levels, Recent Episodes (client-side episodes.js), Retention Health, Event Types donut — backed by 4 new read-only /api/stats endpoints (sensor-environment with Matter cluster_id disambig + ÷100, battery-levels low-first, retention-health archive→null-on-error, characteristic-breakdown JS-side Other bucketing). CSS-driven .hc-cat-0..8 donut fills. No schema/migration changes | 2026-06-02 | (g92-01) | [260602-g92-tier-2-dashboard-panels-sensor-environme](./quick/260602-g92-tier-2-dashboard-panels-sensor-environme/) |
| 260608-dwu | Rewrite stale `.claude/skills/release/SKILL.md` to document the ACTUAL GitLab release flow (tag push → `.gitlab-ci.yml` validate→multi-arch Docker Hub build→auto-create GitLab Release from the matching `## [VERSION]` CHANGELOG.md section) instead of the dead GitHub flow (`gh release create`, `GA_RELEASES_ENABLED`, `.github/workflows/docker.yml`). Kept step-by-step structure + Important cautions; documents updating BOTH CHANGELOG.md (= release notes verbatim) and web/src/changelog.js. Found while cutting v0.2.0. NOTE: `.claude/` is gitignored → local-tooling change, no repo commit | 2026-06-08 | — (local .claude tooling, gitignored) | [260608-dwu-rewrite-stale-release-skill-to-document-](./quick/260608-dwu-rewrite-stale-release-skill-to-document-/) |
| 260608-f4h | Fix flaky CI test `listener/test/dnssd-fqdn-cycle.test.js` (failed pipeline #2585155687, main `test` job, 354/355 `outcome:'hung'`). Root cause: timing fragility, not a patch failure — the cycle-guard test runs readFQDN() in a worker_threads Worker and a 1000ms setTimeout declared 'hung'; the patched guard throws in µs (128-iter budget) so that latency is cold worker-spawn + dynamic ESM import of dnssd, which exceeds 1s on the loaded GitLab shared runner → false 'hung' (patch-package `dnssd ✔` in CI; positive-case test passed; passes locally). Fix: widen the single safety deadline 1000→15000ms, semantics preserved (timeout still resolves 'hung'; assertion still requires 'threw', so a broken guard still fails). 355/355 listener tests pass locally; CI-verified green (pipeline #2585302988 success) | 2026-06-08 | 7c90f50 | [260608-f4h-fix-flaky-dnssd-fqdn-cycle-test-timeout-](./quick/260608-f4h-fix-flaky-dnssd-fqdn-cycle-test-timeout-/) |
| 260608-ffr | Fix `.gitlab-ci.yml` create-release job: release-cli `--description /tmp/release-notes.md` passed the file PATH (release-cli takes --description as a literal string, doesn't read files), so every GitLab Release description was the literal text "/tmp/release-notes.md" instead of the changelog (confirmed on live v0.2.0; repaired by hand via `glab release create v0.2.0 --notes-file`). Fix: `--description "$(cat /tmp/release-notes.md)"` (kept the file-write to avoid arg-quoting issues). One-line change; not testable via npm (CI YAML) — real proof is next tagged release | 2026-06-08 | 08875ba | [260608-ffr-fix-create-release-job-to-pass-changelog](./quick/260608-ffr-fix-create-release-job-to-pass-changelog/) |
| 260608-fnr | Fix the timing-out GitLab beta-deploy webhook (`Net::ReadTimeout` on every push to main). Root cause is structural, not transient: the GitLab project push webhook calls Dockhand's BLOCKING `POST /api/git/stacks/10/webhook`, which rebuilds the beta stack from source (docker-compose.beta.yml builds images every deploy — minutes), so it can never answer within GitLab.com's hard, non-configurable 10s webhook read timeout; GitLab auto-disables webhooks after repeated failures, risking silent loss of beta auto-deploy. Fix: stop relying on the blocking webhook — add a `deploy` stage + `deploy-beta` job to `.gitlab-ci.yml` that triggers Dockhand's ASYNC `POST /api/git/stacks/10/sync` (returns 2xx immediately, builds in background — same endpoint scripts/deploy-beta.sh already uses). Job: `rules` only on `$CI_COMMIT_BRANCH == "main"`, `needs: [test]` (red build never deploys), `curlimages/curl:latest` with `entrypoint: [""]` (default ENTRYPOINT ["curl"] would swallow GitLab's injected shell script), `curl -fsS` (fail job on 4xx/5xx) with `$DOCKHAND_TOKEN` Bearer auth + unset-guard. YAML validated. **NON-FUNCTIONAL until the user does two manual GitLab steps: (1) add `DOCKHAND_TOKEN` as a masked+protected CI/CD variable; (2) delete the old `/webhook` push webhook.** Confirmed: runner can reach dh.venamis.net; /sync requires Bearer (401 without) | 2026-06-08 | 2256ba0 | [260608-fnr-fix-timing-out-gitlab-beta-deploy-webhoo](./quick/260608-fnr-fix-timing-out-gitlab-beta-deploy-webhoo/) |

## Session Continuity

Last session: 2026-06-10T20:24:50.656Z
Stopped at: Phase 20 UI-SPEC approved
Resume file: None
---
