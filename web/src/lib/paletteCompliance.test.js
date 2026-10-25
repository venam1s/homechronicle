import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PALETTE_IDS, MODES, STATUS_SOLID, buildTokens } from './palettes.js';
import { contrastRatio, parseHex, toHex } from './color.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');

function jsxFiles(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) jsxFiles(full, acc);
    else if (name.endsWith('.jsx') && !name.includes('.test.')) acc.push(full);
  }
  return acc;
}

// A Tailwind palette utility (bg-blue-600, text-red-500 …) is a fixed colour.
// It cannot follow the twelve palettes or their dark variants, so it silently
// stays blue/red whichever palette the user picked. 245 of these were swept in
// v0.4; this keeps them from coming back.
const HARDCODED = new RegExp(
  String.raw`\b(?:bg|text|border|ring|from|to|via|divide|placeholder|decoration|outline|shadow|accent|caret)` +
  String.raw`-(?:blue|red|green|amber|yellow|emerald|slate|gray|grey|indigo|purple|pink|orange|teal|cyan|rose|violet|sky|lime|fuchsia|stone|zinc|neutral)` +
  String.raw`-\d{2,3}(?:\/\d{1,3})?\b`,
  'g',
);

describe('palette compliance', () => {
  const files = jsxFiles(SRC);

  it('scans the whole component tree', () => {
    expect(files.length).toBeGreaterThan(40);
  });

  it('uses no hardcoded Tailwind palette colours', () => {
    const offenders = [];
    for (const file of files) {
      const src = readFileSync(file, 'utf8');
      src.split('\n').forEach((line, i) => {
        for (const m of line.matchAll(HARDCODED)) {
          offenders.push(`${file.replace(SRC + '/', '')}:${i + 1} ${m[0]}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  // A hardcoded white foreground was the failure mode the sweep exposed: white
  // on Ink's dark accent measures 2.08:1. An earlier version of this check only
  // looked for `text-white` beside a `bg-hc-*` class, which missed fills set
  // through inline styles — the Room Map put white on --hc-room-N (as low as
  // 1.5:1) and three help modals put `color: '#fff'` on the accent. Every fill
  // in this app is palette-driven, so white text is never safe: foreground on a
  // solid fill must come from an --hc-on-* or --hc-room-N-on token.
  it('never hardcodes a white foreground', () => {
    const WHITE = [
      /(?<![\w-])text-white(?![\w-])/,
      /\bcolor:\s*['"](?:#fff(?:fff)?|white)['"]/i,
    ];
    const offenders = [];
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (WHITE.some((re) => re.test(line))) {
          offenders.push(`${file.replace(SRC + '/', '')}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });
});

describe('foreground-on-solid tokens', () => {
  it.each(PALETTE_IDS)('%s: on-accent meets AA against its own accent', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      expect(contrastRatio(t['on-accent'], t['accent-strong']), `${id}.${mode}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Graphite light shipped on-success/on-warning at 4.36:1 while only
  // on-accent was asserted here.
  it.each(PALETTE_IDS)('%s: on-danger/success/warning meet AA against their status fills', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      for (const status of ['danger', 'success', 'warning']) {
        expect(
          contrastRatio(t[`on-${status}`], STATUS_SOLID[mode][status]),
          `${id}.${mode} on-${status}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(PALETTE_IDS)('%s: room-N-on meets AA against every room slot', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      for (let slot = 1; slot <= 9; slot += 1) {
        expect(
          contrastRatio(t[`room-${slot}-on`], t[`room-${slot}`]),
          `${id}.${mode} room-${slot}-on`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it.each(PALETTE_IDS)('%s: every on-* token is defined', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      for (const key of ['on-accent', 'on-danger', 'on-success', 'on-warning']) {
        expect(t[key], `${id}.${mode} --hc-${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});

// --hc-stale-* / --hc-quiet-* live in index.css (shared across palettes, like
// the status tokens) and are translucent, so the tint each palette actually
// shows depends on its panel colour. Read them straight from the stylesheet so
// this can't drift from what ships.
describe('signal tints', () => {
  const css = readFileSync(join(SRC, 'index.css'), 'utf8');
  const darkAt = css.indexOf('html.theme-dark {');

  function readTokens(block) {
    const out = {};
    for (const m of block.matchAll(/--hc-(stale|quiet)-(bg|text):\s*([^;]+);/g)) {
      out[`${m[1]}-${m[2]}`] = m[3].trim();
    }
    return out;
  }

  const TOKENS = { light: readTokens(css.slice(0, darkAt)), dark: readTokens(css.slice(darkAt)) };

  function composite(base, rgba) {
    const [r, g, b, a] = rgba.match(/[\d.]+/g).map(Number);
    return toHex(parseHex(base).map((v, i) => Math.round(v * (1 - a) + [r, g, b][i] * a)));
  }

  it('defines both tints in light and dark', () => {
    for (const mode of MODES) {
      for (const key of ['stale-bg', 'stale-text', 'quiet-bg', 'quiet-text']) {
        expect(TOKENS[mode][key], `${mode} --hc-${key}`).toBeTruthy();
      }
    }
  });

  it.each(PALETTE_IDS)('%s: stale/quiet text meets AA on its tint over the panel', (id) => {
    for (const mode of MODES) {
      const panel = buildTokens(id, mode).panel;
      for (const signal of ['stale', 'quiet']) {
        const bg = composite(panel, TOKENS[mode][`${signal}-bg`]);
        expect(
          contrastRatio(TOKENS[mode][`${signal}-text`], bg),
          `${id}.${mode} ${signal}`,
        ).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});
