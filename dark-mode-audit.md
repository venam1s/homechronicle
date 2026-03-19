The only project CSS file is `web/src/index.css`. Here's the audit:

## CSS Variable Definitions (lines 5-178) — OK

All hex/rgba values inside `:root`, `.theme-dark`, and skin/accent blocks are **defining** CSS variables. These are correct and expected.

## Hardcoded Colors Outside Variable Definitions

These are the problematic lines — hardcoded colors used directly in rules instead of referencing CSS variables:

### Light mode (no theme qualifier)

| Line | Selector | Hardcoded Value | Should Use |
|------|----------|----------------|------------|
| 344 | `.add-device-row-selected .text-gray-400` | `#64748b` | `var(--hc-muted)` |

### Dark mode overrides (`html.theme-dark`)

| Line | Selector | Hardcoded Value | Should Use |
|------|----------|----------------|------------|
| 357 | `.bg-gray-100` | `#1f2937` | New variable or `var(--hc-panel-soft)` |
| 365 | `.bg-gray-200/300, .border-gray-200/300, .border-slate-200` | `#334155` | `var(--hc-panel-border)` (already `#1e293b`) or new var |
| 380 | `.text-gray-900/800/700` | `#e2e8f0` | `var(--hc-fg)` |
| 386 | `.text-gray-600/500, .text-slate-500` | `#cbd5e1` | New `--hc-muted-light` or similar |
| 391 | `.text-gray-400/300` | `#94a3b8` | `var(--hc-muted)` |
| 395 | `.hover\:bg-gray-50:hover` | `#1e293b` | `var(--hc-panel-border)` |
| 399 | `.hover\:bg-gray-100:hover` | `#334155` | Same var as line 365 |
| 403 | `.hover\:bg-gray-200:hover` | `#475569` | New `--hc-panel-hover` or similar |
| 408 | `.hover\:text-gray-600/800:hover` | `#f8fafc` | New `--hc-fg-strong` or similar |
| 422 | `.add-device-row-selected .text-gray-400` | `#cbd5e1` | Same var as line 386 |
| 433 | `.bg-amber-50\/70` | `rgba(217, 119, 6, 0.12)` | New `--hc-warning-*` var |
| 437 | `.hover\:bg-amber-50:hover` | `rgba(217, 119, 6, 0.18)` | New `--hc-warning-*` var |
| 441 | `.bg-amber-100` | `rgba(217, 119, 6, 0.22)` | New `--hc-warning-*` var |
| 445 | `.bg-amber-50\/20` | `rgba(217, 119, 6, 0.08)` | New `--hc-warning-*` var |
| 449 | `.text-amber-700` | `#fbbf24` | New `--hc-warning-text` var |
| 453 | `.border-amber-100` | `rgba(217, 119, 6, 0.2)` | New `--hc-warning-*` var |

## Summary

**16 hardcoded color values** in rules outside of variable definitions. They fall into three groups:

1. **Gray scale overrides (10 instances)** — Most map to existing variables (`--hc-fg`, `--hc-muted`, `--hc-panel-border`) or need 2-3 new ones (`--hc-fg-strong`, `--hc-muted-light`, `--hc-panel-hover`).

2. **Amber/warning overrides (6 instances)** — All use raw `rgba(217, 119, 6, ...)`. Adding `--hc-warning-rgb` as a variable (like `--hc-accent-rgb`) would let these use `rgba(var(--hc-warning-rgb), <alpha>)` consistently.

3. **Light-mode stray (1 instance)** — Line 344 can use `var(--hc-muted)` directly.

Want me to fix these by introducing the missing variables and replacing the hardcoded values?
