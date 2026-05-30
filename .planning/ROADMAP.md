# Roadmap: HomeChronicle

## Milestones

- ✅ **v1.0 Code Health** — Phases 1-7 (shipped 2026-04-06)
- ✅ **v1.1 Scheduled Repair** — Phases 8-9 (shipped 2026-04-08)
- ✅ **v1.2 UI Redesign** — Phases 10-17 (shipped 2026-04-16)
- ✅ **v1.3 Repair Reliability Fixes** — Phases 18-19 (shipped 2026-04-21)

## Phases

<details>
<summary>✅ v1.0 Code Health (Phases 1-7) — SHIPPED 2026-04-06</summary>

- [x] Phase 1: Error Handler Foundation (2/2 plans) — completed
- [x] Phase 2: Migration System (2/2 plans) — completed
- [x] Phase 3: Count Optimization (1/1 plan) — completed
- [x] Phase 4: Router Extraction — Simple Groups (3/3 plans) — completed
- [x] Phase 5: Router Extraction — Accessories (2/2 plans) — completed
- [x] Phase 6: Router Extraction — Setup (2/2 plans) — completed
- [x] Phase 7: Tech Debt Cleanup (2/2 plans) — completed

See `milestones/v1.0-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.1 Scheduled Repair (Phases 8-9) — SHIPPED 2026-04-08</summary>

- [x] Phase 8: Scheduled Repair Backend (2/2 plans) — completed
- [x] Phase 9: Scheduled Repair UI (1/1 plan) — completed

See `milestones/v1.1-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.2 UI Redesign (Phases 10-17) — SHIPPED 2026-04-16</summary>

- [x] Phase 10: Design Token Foundation (4/4 plans) — completed 2026-04-14
- [x] Phase 11: Sidebar Navigation Shell (3/3 plans) — completed 2026-04-14
- [x] Phase 12: Page Extraction & Card Layout (3/3 plans) — completed 2026-04-15
- [x] Phase 13: Responsive Sidebar (3/3 plans) — completed 2026-04-15
- [x] Phase 14: Dashboard Widgets (3/3 plans) — completed 2026-04-15
- [x] Phase 15: Chart Styling (3/3 plans) — completed 2026-04-15
- [x] Phase 16: Verification Sweep & Requirements Update (2/2 plans) — completed 2026-04-16
- [x] Phase 17: Token Debt Cleanup (4/4 plans) — completed 2026-04-16

See `milestones/v1.2-ROADMAP.md` for full details.

</details>

<details>
<summary>✅ v1.3 Repair Reliability Fixes (Phases 18-19) — SHIPPED 2026-04-21</summary>

- [x] Phase 18: Scheduled Repair — Subscriber Restart Fix (1/1 plan) — completed 2026-04-20
- [x] Phase 19: Scheduled Repair — Full pairSetup() Capability (1/1 plan) — completed 2026-04-21

See `milestones/v1.3-ROADMAP.md` for full details.

</details>

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1-7 | v1.0 | 14/14 | Complete | 2026-04-06 |
| 8-9 | v1.1 | 3/3 | Complete | 2026-04-08 |
| 10-17 | v1.2 | 25/25 | Complete | 2026-04-16 |
| 18 | v1.3 | 1/1 | Complete | 2026-04-20 |
| 19 | v1.3 | 1/1 | Complete | 2026-04-21 |

## Candidates / Backlog

> Parked ideas not yet committed to a milestone. Promote via `/gsd:review-backlog` or `/gsd:new-milestone` when ready.

### Opt-in Update Check & Anonymous Telemetry (candidate, suggested v1.4)

**Problem:** Docker pull counts conflate CI rebuilds, curious tire-kickers, and running instances. No visibility into who is actually running HomeChronicle, on what version, or on what platform.

**Proposal:** Daily update-check ping from the listener to a small versions endpoint. Drives an in-UI "update available" badge and gives the maintainer DAU + version distribution + platform split.

**Payload (sketch):**
```json
{
  "instanceId": "uuid-v4 stored once in /app/data/instance.json",
  "version": "0.1.10",
  "platform": "linux/arm64",
  "uptime_hours": 168,
  "accessory_count_bucket": "10-49"
}
```

**Privacy posture (non-negotiable for this audience):**
- Default **OFF**. Opt-in via Manage → Privacy with first-boot modal showing the full payload preview.
- All counts bucketed (never raw values).
- No IP logging server-side; aggregate counters only.
- Full payload documented in README and surfaced in `/api/setup` response so power users can verify.

**Server side:** Cloudflare Worker + D1 (or KV counters). ~$0/mo at expected scale. Dashboard: SQL views for `daily_active_instances`, `version_distribution`, `platform_split`.

**Cheap signals to enable first** (no code, this week):
- GitLab → Analytics → Repository (unique visitors, clones).
- GitHub mirror → Insights → Traffic (rolling 14-day).
- GitLab Container Registry → per-tag pull counts (compare `:latest` vs versioned tags).
- Turn on GitHub Discussions; pin a "Show your setup" thread; link from web UI footer.

**Open questions before promoting to a milestone:**
- Domain/host for the versions endpoint (`versions.homechronicle.dev`?).
- Worker vs. self-hosted endpoint (avoids Cloudflare dependency).
- Bucket boundaries for `accessory_count_bucket` and any future fields.
- Should the in-UI badge use the same endpoint or a separate `/latest.json` GitHub Pages file (cheaper, no infra)?
