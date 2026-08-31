import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const COMPONENTS = join(dirname(fileURLToPath(import.meta.url)), '..', 'components');

/** Components that render a Recharts chart or an SVG figure. */
function chartFiles() {
  return readdirSync(COMPONENTS)
    .filter((f) => f.endsWith('.jsx') && !f.includes('.test.'))
    .filter((f) => {
      const src = readFileSync(join(COMPONENTS, f), 'utf8');
      return src.includes('recharts') || /<svg[\s>]/.test(src);
    });
}

// CHART-01: a chart colour written as a hex literal cannot follow the palette.
// Colours must come from --hc-* tokens, an .hc-cat-N class, or useAccentRgb.
// This is a guard, not a style rule: it caught a hardcoded ten-colour donut
// array in AccessoryDetail that stayed blue/violet/pink in all twelve palettes.
describe('chart colours are palette-driven', () => {
  const files = chartFiles();

  it('finds the chart components to check', () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(chartFiles())('%s uses no hardcoded hex colours', (file) => {
    const src = readFileSync(join(COMPONENTS, file), 'utf8');
    const offenders = [];

    src.split('\n').forEach((line, i) => {
      if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
      for (const m of line.matchAll(/#[0-9a-fA-F]{3,8}\b/g)) {
        // An id selector or a URL fragment is not a colour.
        if (/(?:href|id|url\()\s*=?\s*["'(]?$/.test(line.slice(0, m.index))) continue;
        offenders.push(`${file}:${i + 1} ${m[0]}`);
      }
    });

    expect(offenders).toEqual([]);
  });

  it.each(chartFiles())('%s uses no hardcoded Tailwind palette colours on chart marks', (file) => {
    const src = readFileSync(join(COMPONENTS, file), 'utf8');
    // Only flag them inside fill/stroke props — Tailwind utility classes on
    // surrounding layout are a separate (already-tracked) concern.
    const offenders = [...src.matchAll(/(?:fill|stroke)=["{][^"}\n]*\b(?:blue|red|green|amber|emerald|slate|indigo|violet|pink|orange|teal|cyan|sky|lime)-[0-9]{2,3}\b/g)]
      .map((m) => m[0]);
    expect(offenders).toEqual([]);
  });
});
