import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PALETTE_IDS, MODES, buildTokens } from './palettes.js';
import { contrastRatio } from './color.js';

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

  // `text-white` on a palette-driven solid fill was the failure mode the sweep
  // exposed: white on Ink's dark accent measures 2.08:1. Foreground on a solid
  // fill must come from an --hc-on-* token, which is derived to meet AA.
  it('never puts text-white on a palette-driven solid fill', () => {
    const SOLID = /bg-hc-(?:accent-(?:strong|stronger)|danger-text|success-text|warning-text)/;
    const offenders = [];
    for (const file of files) {
      readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (SOLID.test(line) && /(?<![\w-])text-white(?![\w-])/.test(line)) {
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

  it.each(PALETTE_IDS)('%s: every on-* token is defined', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      for (const key of ['on-accent', 'on-danger', 'on-success', 'on-warning']) {
        expect(t[key], `${id}.${mode} --hc-${key}`).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });
});
