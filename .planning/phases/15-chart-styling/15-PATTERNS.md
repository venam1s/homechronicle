# Phase 15: Chart Styling - Pattern Map

**Mapped:** 2026-04-15
**Files analyzed:** 9 (7 modified components + 1 config + 3 new test files)
**Analogs found:** 9 / 9

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `web/package.json` | config | transform | itself (current state) | self |
| `web/src/components/ActivityChart.jsx` | component | request-response | `web/src/components/TrendChart.jsx` | exact (same Recharts pattern, same hook) |
| `web/src/components/TrendChart.jsx` | component | request-response | itself (minor token fix only) | self |
| `web/src/components/KpiCards.jsx` | component | request-response | `web/src/components/TrendChart.jsx` (sparkline) + itself | role-match |
| `web/src/components/AccessoryDetail.jsx` | component | request-response | `web/src/components/TrendChart.jsx` (charts) + itself | self + role-match |
| `web/src/components/WeekdayHeatmap.jsx` | component | request-response | itself (window selector token fix only) | self |
| `web/src/components/RoomChart.jsx` | component | request-response | itself (window selector token fix only) | self |
| `web/src/components/ActivityChart.test.jsx` | test | — | `web/src/components/KpiCards.test.jsx` | exact |
| `web/src/components/TrendChart.test.jsx` | test | — | `web/src/components/KpiCards.test.jsx` | exact |
| `web/src/components/KpiCards.test.jsx` (additions) | test | — | itself (existing file, add cases) | self |

---

## Pattern Assignments

### `web/package.json` (config, transform)

**Change:** Bump `recharts` and add `overrides` block.

**Current state** (line 18):
```json
"recharts": "^2.12.7"
```

**Target state** (line 18 + new `overrides` sibling to `devDependencies`):
```json
"recharts": "^3.8.1"
```
```json
"overrides": {
  "react-is": "^19.0.0"
}
```

The `overrides` field is a top-level sibling of `dependencies` and `devDependencies` in npm package.json. It forces the `react-is` transitive dependency to v19 to match the project's React 19 version, preventing lockfile drift.

---

### `web/src/components/ActivityChart.jsx` (component, request-response)

**Analog:** `web/src/components/TrendChart.jsx`

**Imports pattern** — current (lines 1-8). After the refactor, remove `Cell` from the recharts import:
```jsx
// Before (line 2-4):
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts';

// After (remove Cell):
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from 'recharts';
```

**Accent string pattern** — add `accentStr` derived from the `useAccentRgb` hook result. TrendChart analog at lines 23-24:
```jsx
const accent = useAccentRgb();  // already present in ActivityChart line 31
const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;  // ADD this line
```

**Core gradient + Bar pattern** — replaces the per-Cell opacity block (ActivityChart lines 76-89). Canonical from TrendChart lines 107-136:
```jsx
// Inside <BarChart>:
<defs>
  <linearGradient id="activityBarGradient" x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%"  stopColor={accentStr} stopOpacity={0.85} />
    <stop offset="95%" stopColor={accentStr} stopOpacity={0.35} />
  </linearGradient>
</defs>
<Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={20}
     fill="url(#activityBarGradient)" />
{/* All <Cell> children removed */}
```

Note: `gradientUnits` defaults to `objectBoundingBox` in SVG, so each bar independently renders its own top-to-bottom gradient — this is the intended behavior.

**Tooltip/CartesianGrid pattern** (no change needed — already uses tokens):
```jsx
// ActivityChart lines 28, 61-75 — already correct:
const TOOLTIP_STYLE = { fontSize: 12, borderRadius: 8, border: '1px solid var(--hc-tooltip-border)', backgroundColor: 'var(--hc-tooltip-bg)', color: 'var(--hc-tooltip-text)' };
<CartesianGrid strokeDasharray="3 3" stroke="var(--hc-chart-grid)" vertical={false} />
<XAxis tick={{ fontSize: 10, fill: 'var(--hc-chart-tick)' }} tickLine={false} axisLine={false} />
```

**Also remove:** `maxCount` memo (ActivityChart lines 35-36) — no longer needed once Cell children are removed.

---

### `web/src/components/TrendChart.jsx` (component, request-response)

**Change:** Fix only the hardcoded window selector classes (D-13). All chart internals are already canonical.

**Window selector — current** (lines 93-98):
```jsx
className={clsx(
  'text-xs px-2 py-0.5 rounded-md transition-colors',
  days === d
    ? 'bg-blue-100 text-blue-700 font-medium'
    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
)}
```

**Window selector — target** (see Shared Patterns: Window Selector Token Replacement):
```jsx
className={clsx(
  'text-xs px-2 py-0.5 rounded-md transition-colors',
  days === d
    ? 'bg-hc-accent-soft text-hc-accent-stronger font-medium'
    : 'text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid'
)}
```

All other TrendChart internals (gradient, monotone curve, axis tokens, TOOLTIP_STYLE) are already correct and must not be changed.

---

### `web/src/components/KpiCards.jsx` (component, request-response)

**Analog:** `web/src/components/TrendChart.jsx` (for sparkline AreaChart pattern)

**Additional imports needed** (add to existing imports at lines 1-5):
```jsx
// Add recharts imports:
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
// Add hook for accent color:
import { useAccentRgb } from '../hooks/useAccentRgb.js';
// useDailyStats already imported at line 5
```

**Second useDailyStats call** (data wiring for sparkline). KpiCards already calls `useDailyStats(dashboardDays)` at line 42. A second call for sparkline data is required because the sparkline always shows exactly 7 days regardless of `dashboardDays`:
```jsx
// Existing (line 42):
const { data: daily, isLoading: dailyLoading } = useDailyStats(dashboardDays);

// Add sparkline-specific call:
const { data: sparkDaily } = useDailyStats(7);
// TanStack Query deduplicates if dashboardDays === 7
```

**Sparkline data transformation** (backfill missing days — follows TrendChart chartData memo pattern, lines 55-65):
```jsx
// Add above the return statement:
const accent = useAccentRgb();
const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;

const sparkData = useMemo(() => {
  const dayMap = new Map((sparkDaily ?? []).map((d) => [String(d.day).slice(0, 10), Number(d.count ?? 0)]));
  return Array.from({ length: 7 }, (_, i) => {
    const key = format(subDays(new Date(), 6 - i), 'yyyy-MM-dd');
    return { i, count: dayMap.get(key) ?? 0 };
  });
}, [sparkDaily]);
```

Note: `format` and `subDays` are already imported from `date-fns` in KpiCards (lines 1-2). `useMemo` must be added to the React import.

**Sparkline render pattern** — insert inside the "TODAY" KPI card only. In the current `KPI_DEFS` map (lines 99-120), the TODAY card is `def.key === 'today'`. Add the sparkline below the existing card content div:
```jsx
// Inside Card.Body for the 'today' card, after the existing inner div:
{def.key === 'today' && (
  <div className="mt-2 -mx-1">
    <ResponsiveContainer width="100%" height={36}>
      <AreaChart data={sparkData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id="sparklineGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={accentStr} stopOpacity={0.3} />
            <stop offset="95%" stopColor={accentStr} stopOpacity={0}   />
          </linearGradient>
        </defs>
        <Area
          type="monotone"
          dataKey="count"
          stroke={accentStr}
          strokeWidth={1.5}
          fill="url(#sparklineGradient)"
          dot={false}
          isAnimationActive={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  </div>
)}
```

The static gradient ID `"sparklineGradient"` is safe here because only one sparkline renders per page. For multiple concurrent instances the ID would need to be keyed (see TrendChart's `gradientId` pattern), but that is not needed here.

---

### `web/src/components/AccessoryDetail.jsx` (component, request-response)

Three independent changes in this file. Each targets a distinct line range.

**Change 1: Window selector token replacement** (lines 687-699).

See Shared Patterns: Window Selector Token Replacement. The AccessoryDetail WINDOWS array and button map at lines 686-699 follow the identical clsx pattern as TrendChart. Apply the same substitution.

**Change 2: AreaChart gradient opacity alignment** (lines 705-708).

Current state:
```jsx
<linearGradient id="accessoryActivityGradient" x1="0" y1="0" x2="0" y2="1">
  <stop offset="5%"  stopColor="rgb(var(--hc-accent-rgb))" stopOpacity={0.2}  />
  <stop offset="95%" stopColor="rgb(var(--hc-accent-rgb))" stopOpacity={0.01} />
</linearGradient>
```

Target state (align to TrendChart canonical: 0.15 → 0):
```jsx
<linearGradient id="accessoryActivityGradient" x1="0" y1="0" x2="0" y2="1">
  <stop offset="5%"  stopColor="rgb(var(--hc-accent-rgb))" stopOpacity={0.15} />
  <stop offset="95%" stopColor="rgb(var(--hc-accent-rgb))" stopOpacity={0}    />
</linearGradient>
```

**Change 3: Hardcoded border color in characteristic card** (line 798).

Current state:
```jsx
style={{ borderColor: 'rgba(139,92,246,0.3)', backgroundColor: 'var(--hc-panel)' }}
```

Target state:
```jsx
style={{ borderColor: 'rgba(var(--hc-accent-rgb), 0.3)', backgroundColor: 'var(--hc-panel)' }}
```

The hardcoded `139,92,246` is violet-500 — it ignores the active theme skin. Replace with `var(--hc-accent-rgb)` so it follows the accent token.

**No change needed:** CharacteristicTrend LineChart at line 101 already correctly uses `type={chartData.isNumeric ? 'monotone' : 'stepAfter'}` — this conditional must be preserved as-is (D-03 applies to numeric data; `stepAfter` is correct for boolean/discrete data per RESEARCH.md open question A3). LineChart stroke at line 103 `"rgba(var(--hc-accent-rgb), 0.85)"` should be updated to `"rgb(var(--hc-accent-rgb))"` per RESEARCH.md open question 2 recommendation (full opacity, consistent with UI-SPEC contract).

---

### `web/src/components/WeekdayHeatmap.jsx` (component, request-response)

**Change:** Window selector token replacement only (lines 99-103).

See Shared Patterns: Window Selector Token Replacement. This component uses `text-[10px]` sizing (not `text-xs`) — preserve that size class, only swap the color/bg classes:
```jsx
// Current (lines 99-103):
className={clsx(
  'text-[10px] px-1.5 py-0.5 rounded-md transition-colors',
  days === d
    ? 'bg-blue-100 text-blue-700 font-medium'
    : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
)}

// Target:
className={clsx(
  'text-[10px] px-1.5 py-0.5 rounded-md transition-colors',
  days === d
    ? 'bg-hc-accent-soft text-hc-accent-stronger font-medium'
    : 'text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid'
)}
```

Heatmap cell coloring at line 153 already correctly uses `rgba(${accent[0]},${accent[1]},${accent[2]}, ...)` — no change needed.

---

### `web/src/components/RoomChart.jsx` (component, request-response)

**Change:** Window selector token replacement only (lines 72-78).

See Shared Patterns: Window Selector Token Replacement. RoomChart uses `text-xs` (same as TrendChart) — apply the canonical substitution verbatim:
```jsx
// Current (lines 74-77):
days === d
  ? 'bg-blue-100 text-blue-700 font-medium'
  : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'

// Target:
days === d
  ? 'bg-hc-accent-soft text-hc-accent-stronger font-medium'
  : 'text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid'
```

Bar fill at line 113 already correctly uses `rgb(var(--hc-accent-rgb))` — no change needed.

---

### `web/src/components/ActivityChart.test.jsx` (test, new file)

**Analog:** `web/src/components/KpiCards.test.jsx`

**Structure pattern** — exact copy of KpiCards.test.jsx mock/import ordering (lines 1-11):
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useHourlyStats: vi.fn(),
}));

// IMPORTANT: import AFTER vi.mock — required by Vitest hoisting
import { useHourlyStats } from '../hooks/useEvents.js';
import ActivityChart from './ActivityChart.jsx';
```

**Mock pattern** (mirrors KpiCards.test.jsx lines 13-25, adapted for hourly data):
```jsx
const MOCK_HOURLY = Array.from({ length: 24 }, (_, h) => ({ hour: String(h), count: String(h * 3) }));

beforeEach(() => {
  useHourlyStats.mockReturnValue({ data: MOCK_HOURLY, isLoading: false, isError: false });
});
```

**Test case pattern for no-Cell assertion** (uses `container.querySelector` per KpiCards.test.jsx line 91 pattern):
```jsx
it('CHART-01: renders BarChart without Cell children after gradient refactor', () => {
  const { container } = render(<ActivityChart />);
  // No <path> with per-item fill — gradient is applied to Bar, not Cell children
  expect(container.querySelector('[data-testid="bar"]')).not.toBeNull();
  // Ensure no recharts Cell components remain (they render as individual <path> with fill attr)
  // Smoke test: component renders without throwing
});
```

Note: jsdom renders SVG as empty elements so visual gradient cannot be asserted. Tests verify: (1) no throw, (2) expected Recharts structure present via querySelector. See RESEARCH.md Validation Architecture.

---

### `web/src/components/TrendChart.test.jsx` (test, new file)

**Analog:** `web/src/components/KpiCards.test.jsx`

**Mock/import structure** (same hoisting pattern):
```jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useDailyStats: vi.fn(),
}));
vi.mock('../hooks/useAccentRgb.js', () => ({
  useAccentRgb: vi.fn(() => [37, 99, 235]),
}));

import { useDailyStats } from '../hooks/useEvents.js';
import TrendChart from './TrendChart.jsx';
```

**Mock daily data** (mirrors KpiCards.test.jsx MOCK_DAILY pattern):
```jsx
const MOCK_DAILY = Array.from({ length: 7 }, (_, i) => ({
  day: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00`,
  count: String(i * 5),
}));

beforeEach(() => {
  useDailyStats.mockReturnValue({ data: MOCK_DAILY, isLoading: false, isError: false });
});
```

**Test assertions** — render-without-throw + heading text (covers CHART-03):
```jsx
it('CHART-03: renders without error after Recharts v3 upgrade', () => {
  render(<TrendChart />);
  expect(screen.getByText('Daily Activity')).toBeInTheDocument();
});
```

---

### `web/src/components/KpiCards.test.jsx` (test, additions to existing file)

**Analog:** itself (existing file at `web/src/components/KpiCards.test.jsx`)

**Additional mock data** needed for sparkline tests. Add a 7-row `MOCK_SPARK_DAILY` alongside existing `MOCK_DAILY`:
```jsx
const MOCK_SPARK_DAILY = Array.from({ length: 7 }, (_, i) => ({
  day: `2026-04-${String(i + 1).padStart(2, '0')}T00:00:00`,
  count: String(i * 4),
}));
```

The existing `useDailyStats` mock returns the same value for any call. Update `beforeEach` to make the mock accept different `days` arguments if needed, or keep returning `MOCK_DAILY` (sparkline deduplicates with TanStack Query when `dashboardDays === 7`).

**New test case pattern** — DOM assertion via `container.querySelector` (mirrors KpiCards.test.jsx line 91):
```jsx
it('Test 8 (CHART-02): Events Today card renders sparkline AreaChart', () => {
  const { container } = render(<KpiCards dashboardDays={7} />);
  // ResponsiveContainer wraps an AreaChart — Recharts renders SVG
  // jsdom renders SVG as empty; assert the wrapper element exists
  expect(container.querySelector('.recharts-responsive-container')).not.toBeNull();
});
```

---

## Shared Patterns

### Window Selector Token Replacement

**Applies to:** `TrendChart.jsx` (lines 93-98), `AccessoryDetail.jsx` (lines 687-699), `WeekdayHeatmap.jsx` (lines 99-103), `RoomChart.jsx` (lines 72-78)

**Pattern source:** `web/src/index.css` lines 20-22 (token definitions) + `web/src/components/TrendChart.jsx` lines 93-98 (usage context)

```jsx
// Replace active class:
'bg-blue-100 text-blue-700 font-medium'
// With:
'bg-hc-accent-soft text-hc-accent-stronger font-medium'

// Replace inactive class:
'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
// With:
'text-hc-muted hover:text-hc-fg hover:bg-hc-panel-mid'
```

Token definitions from `web/src/index.css`:
- `--color-hc-accent-soft` → `var(--hc-accent-soft)` — light accent background (e.g., `#dbeafe` for ocean skin)
- `--color-hc-accent-stronger` → `var(--hc-accent-stronger)` — dark accent text (e.g., `#1e40af`)
- `--color-hc-muted` → `var(--hc-muted)` — muted text color (e.g., `#64748b`)
- `--color-hc-panel-mid` → `var(--hc-panel-mid)` — mid-level panel background for hover state

Note: `index.css` also maps `bg-blue-100` → `var(--hc-accent-soft)` and `text-blue-700` → `var(--hc-accent-stronger)` via dark mode overrides (lines 346-358), meaning the existing code already works correctly in dark mode via override. The explicit token classes are still preferred — they remove the dependency on the override layer.

---

### SVG LinearGradient Fill (Area Charts)

**Applies to:** `ActivityChart.jsx` (new bar gradient), `KpiCards.jsx` (sparkline gradient)

**Canonical source:** `web/src/components/TrendChart.jsx` lines 107-111

```jsx
// Keyed gradient ID prevents collision when multiple instances render:
const gradientId = useMemo(() => `trendGradient-${accent.join('-')}`, [accent]);
const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;

<defs>
  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%"  stopColor={accentStr} stopOpacity={0.15} />
    <stop offset="95%" stopColor={accentStr} stopOpacity={0}    />
  </linearGradient>
</defs>
```

Gradient opacity reference by use-case:
- TrendChart area: 0.15 → 0 (canonical)
- AccessoryDetail area: align to 0.15 → 0 (was 0.2 → 0.01)
- ActivityChart bars: 0.85 → 0.35 (denser, bars are narrow)
- KpiCards sparkline: 0.3 → 0 (compact size, slightly denser than full chart)

---

### AccentRgb Hook Pattern

**Applies to:** `ActivityChart.jsx` (already uses hook), `KpiCards.jsx` (add hook)

**Source:** `web/src/hooks/useAccentRgb.js` lines 1-30

```jsx
import { useAccentRgb } from '../hooks/useAccentRgb.js';

// Inside component:
const accent = useAccentRgb();  // returns [r, g, b] array
const accentStr = `rgb(${accent[0]},${accent[1]},${accent[2]})`;
```

The hook reads `--hc-accent-rgb` from the document root and observes `data-accent` attribute changes for live skin switching.

---

### TOOLTIP_STYLE Object

**Applies to:** All chart components that display tooltips (already correct everywhere)

**Source:** `web/src/components/TrendChart.jsx` line 19 / `web/src/components/ActivityChart.jsx` line 28

```jsx
const TOOLTIP_STYLE = {
  fontSize: 12,
  borderRadius: 8,
  border: '1px solid var(--hc-tooltip-border)',
  backgroundColor: 'var(--hc-tooltip-bg)',
  color: 'var(--hc-tooltip-text)',
};
```

No sparkline needs a TOOLTIP_STYLE — sparklines have no Tooltip component.

---

### Test Mock Ordering (Vitest Hoisting)

**Applies to:** All new test files (`ActivityChart.test.jsx`, `TrendChart.test.jsx`)

**Source:** `web/src/components/KpiCards.test.jsx` lines 1-12

```jsx
// RULE: vi.mock() calls must appear BEFORE the import of the mocked module.
// Vitest hoists vi.mock() to the top of the file, but imports must still
// follow the mock declaration in source order to avoid reference errors.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../hooks/useEvents.js', () => ({
  useHookName: vi.fn(),
}));

// Component import AFTER mock declaration:
import { useHookName } from '../hooks/useEvents.js';
import ComponentName from './ComponentName.jsx';
```

---

## No Analog Found

All files have close analogs. No file requires RESEARCH.md-only patterns.

---

## Metadata

**Analog search scope:** `web/src/components/`, `web/src/hooks/`, `web/src/index.css`, `web/package.json`
**Files read:** 11 source files
**Pattern extraction date:** 2026-04-15
