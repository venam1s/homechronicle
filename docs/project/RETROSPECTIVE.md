# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

## Milestone: v1.2 — UI Redesign

**Shipped:** 2026-04-16
**Phases:** 8 | **Plans:** 25
**Timeline:** 2 days (2026-04-14 → 2026-04-16)

### What Was Built
- Semantic design token system replacing all hardcoded Tailwind dark: classes
- Collapsible vertical sidebar with 5 navigation sections replacing top tab bar
- Card compound component (Header/Body) and modern card-based layout across all pages
- Responsive sidebar — auto-collapse on tablet, sheet drawer on mobile
- Dashboard widgets — KPI health cards with sparklines, live activity feed with scroll-lock, room breakdown with health badges
- Recharts v2 → v3 upgrade with gradient fills, smooth curves, theme-aware colors

### What Worked
- Design tokens first approach — having the token layer in place (Phase 10) before building new components prevented rework across all subsequent phases
- Gap closure phases (16-17) as a pattern — running a milestone audit mid-stream and adding targeted cleanup phases caught verification gaps and token debt before close
- Phase dependency analysis — recognizing Phase 15 (Charts) only depended on Phase 10 (not 14) allowed cleaner execution ordering
- Card compound component pattern — reusable Card/Card.Header/Card.Body avoided repetitive wrapper markup across all pages

### What Was Inefficient
- Summary one-liner extraction from SUMMARY.md files was unreliable — many files had "One-liner:" labels without actual content, requiring manual cleanup at milestone close
- Milestone audit (v1.2-MILESTONE-AUDIT.md) ran before gap-closure phases existed, creating a stale audit that needed mental reconciliation during completion
- Some pending todos in STATE.md (grep audit, shadcn validation, etc.) were resolved during execution but never cleaned from the todo list

### Patterns Established
- CSS custom property tokens as the single source of truth for all colors (light, dark, accent)
- Card compound component pattern for content areas
- useMediaQuery hook for responsive behavior
- Typography scale tokens registered as Tailwind utilities (hc-title, hc-subtitle, etc.)
- Gradient fill pattern for Recharts v3 charts with accent-color awareness

### Key Lessons
1. Run milestone audit AFTER all planned phases complete, not mid-stream — avoids stale audit reconciliation
2. Design token migration should be a single sweep, not split across multiple phases — the token debt cleanup phase (17) existed only because Phase 10 missed edge cases
3. Summary files need enforced one-liner format — the summary-extract tooling can't reliably parse free-form summaries

---

## Milestone: v1.4 — Multi-User Auth & Email

**Shipped:** 2026-06-15
**Phases:** 7 (20-26) | **Plans:** 45
**Timeline:** 2026-06-10 → 2026-06-15

### What Was Built
- Invite-only multi-user auth: argon2id (scrypt fallback) + custom DB-backed sessions + CSRF + first-admin bootstrap; React auth shell (react-router-dom v7)
- Email infrastructure: nodemailer SMTP, invite lifecycle, password reset (no enumeration), admin user CRUD, secret-isolated SMTP config
- Email alert delivery channel through the shared quiet-period suppression path
- Security hardening: active-session revoke UI, periodic token sweep, nginx X-API-Token cutover (session cookie = sole browser auth path)
- Per-user server-backed UI preferences (JSONB blob + me-router + usePreference) and per-user quiet hours
- Member self-serve alerts: per-user owned, IDOR-safe rules; household enable-gate removed

### What Worked
- Additive rollout — keeping `API_TOKEN` + nginx injection in parallel until a dedicated SEC-07 cutover phase let auth land without breaking scripts/HA, and `AUTH_ENABLED=false` gave a one-flag full revert
- Cross-AI plan review (Gemini + Codex) caught two HIGH plan-consistency blockers before execution on the high-risk nginx cutover
- A second fresh code-review pass after `--fix` repeatedly caught bugs the first round of fixes introduced (Phase 24 across-window PUT race; Phase 23 residual)
- TDD Wave-0 RED scaffolds gave every later wave concrete automated verify targets

### What Was Inefficient
- Self-verified keystone trap: Phase 23 was self-verified by its executing agent and shipped a production-boot blocker (CR-01: `.sh` entrypoint hook executed as a child so the token export never reached envsubst) that ALL phase tests passed through — only an independent code-review caught it
- Composition defects invisible to unit suites: gate/template tests that *re-implement* the unit instead of importing it pass while the deployed composition breaks (Phase 20 cluster; Phase 24 per-instance debounce → racing whole-blob PUTs → silent cross-device data loss)
- Subagent fragility: gsd-verifier and the integration-checker died mid-run; verification fell back to inline orchestration. No SendMessage in this harness, so a dead agent's partial work is lost — verify key surfaces directly
- SUMMARY one-liner extraction still unreliable — auto-filled MILESTONES.md with ~30 "One-liner:" / "Task 1 —" fragments needing manual rewrite at close (same issue flagged in v1.2)
- Planning vs release versioning confusion: GSD milestone "v1.4" ≠ the product's `v0.x` GitLab release line — the default `complete-milestone` git tag had to be skipped to avoid a clashing/CI-triggering `v1.4` tag

### Patterns Established
- `AUTH_ENABLED` escape-hatch flag (default on; false = legacy revert) for risky auth rollouts
- One shared provider + serialized flushes + sequence-guarded cache echo for any whole-blob last-writer-wins server state (avoids per-instance racing writes)
- Owner-scoped SQL (`WHERE id AND user_id` → 404) as the IDOR-safe pattern for per-user resources
- Per-user endpoints must stay uncached unless the cache key includes `user_id` (cross-user leak guard)
- `.envsh` (sourced) not `.sh` (child-exec) for nginx entrypoint hooks that must export vars into envsubst
- Keep GSD milestone version separate from release tags; release is a deliberate, separate step

### Key Lessons
1. Run independent code-review + verify-work on keystone/security phases — never accept a self-verified keystone; its own tests cannot see its composition blind spot
2. Verify deployment-mode compositions, not just units — a test that re-implements the unit hides the integration bug
3. Enforce SUMMARY one-liner format (still unfixed across 3 milestones) — auto-aggregation is only as good as the source frontmatter
4. Separate planning version from release version explicitly so milestone-close tooling doesn't cut a bogus tag

---

## Cross-Milestone Trends

### Process Evolution

| Milestone | Phases | Plans | Key Change |
|-----------|--------|-------|------------|
| v1.0 Code Health | 7 | 14 | Established router extraction pattern, integration test pattern |
| v1.1 Scheduled Repair | 2 | 3 | First feature milestone — compact scope, TDD approach |
| v1.2 UI Redesign | 8 | 25 | Largest milestone — gap closure phases, milestone audit pattern |
| v1.3 Repair Reliability | 2 | 2 | Tight bugfix milestone — subscriber restart + full pairSetup |
| v1.4 Multi-User Auth & Email | 7 | 45 | Biggest milestone — additive auth rollout, cross-AI plan review, independent keystone review, in-milestone scope growth (24-26 folded in) |

### Top Lessons (Verified Across Milestones)

1. Token/foundation work first, features second — proven in v1.0 (utils before routers), v1.2 (tokens before components), and v1.4 (security helpers + migrations + AUTH_ENABLED gate before consumers)
2. Gap closure phases are worth the overhead — they catch real issues that accumulate during rapid execution
3. Independent review beats self-verification on keystones — v1.4's self-verified Phase 23 shipped a boot blocker its own green suite couldn't see
4. SUMMARY one-liner format is still unenforced (flagged v1.2 and v1.4) — fix the source format or stop relying on auto-extraction
