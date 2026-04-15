---
phase: 15
slug: chart-styling
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-04-15
---

# Phase 15 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | vitest (jsdom) |
| **Config file** | `web/vite.config.js` |
| **Quick run command** | `cd web && npm test` |
| **Full suite command** | `cd web && npm test` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd web && npm test`
- **After every plan wave:** Run `cd web && npm test`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 15-01-01 | 01 | 1 | CHART-01 | — | N/A | visual | `cd web && npm test` | ✅ | ⬜ pending |
| 15-01-02 | 01 | 1 | CHART-03 | — | N/A | visual | `cd web && npm test` | ✅ | ⬜ pending |
| 15-02-01 | 02 | 1 | CHART-02 | — | N/A | unit | `cd web && npm test` | ❌ W0 | ⬜ pending |
| 15-03-01 | 03 | 2 | CHART-01 | — | N/A | visual | `cd web && npm test` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- Existing infrastructure covers all phase requirements. Vitest with jsdom is already configured.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Gradient fills render visually | CHART-01 | Visual appearance cannot be unit tested | Open dashboard, verify gradient fills on TrendChart and ActivityChart |
| Sparkline renders in KPI card | CHART-02 | Visual appearance in context | Check Events Today KPI card shows mini area chart |
| Theme color switching | CHART-03 | Requires interactive toggle | Switch light/dark mode and accent presets, verify all charts update colors |
| Recharts v3 no regressions | CHART-01 | Smoke test across all chart types | Navigate to dashboard and accessory detail, verify all charts render |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
