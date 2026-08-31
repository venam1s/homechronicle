#!/usr/bin/env node
/**
 * gen-palettes.mjs — generate `src/palettes.css` from `src/lib/palettes.js`.
 *
 * The palette module is the single source of truth; this script flattens it
 * into plain CSS custom properties so the runtime stays CSS-only (no JS is
 * needed to paint a theme, which keeps the first paint free of a flash).
 *
 * Usage:  node scripts/gen-palettes.mjs [--check]
 *
 *   --check  exit non-zero if the committed CSS is stale instead of writing it
 *            (used by the test suite so the two can never drift)
 */

import { writeFileSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PALETTE_IDS, PALETTES, MODES, buildTokens } from '../src/lib/palettes.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = join(HERE, '..', 'src', 'palettes.css');

function emitBlock(selector, tokens) {
  const body = Object.entries(tokens)
    .map(([name, value]) => `    --hc-${name}: ${value};`)
    .join('\n');
  return `  ${selector} {\n${body}\n  }`;
}

function generate() {
  const blocks = [];

  for (const id of PALETTE_IDS) {
    const palette = PALETTES[id];
    for (const mode of MODES) {
      // Light lives on the attribute alone; dark is scoped by .theme-dark so it
      // wins on specificity (0,2,1 vs 0,1,1) without needing !important.
      const selector = mode === 'light'
        ? `html[data-palette='${id}']`
        : `html.theme-dark[data-palette='${id}']`;
      blocks.push(`  /* ${palette.name} — ${palette.tagline} — ${mode} */\n${emitBlock(selector, buildTokens(id, mode))}`);
    }
  }

  return `/*
 * palettes.css — GENERATED FILE, DO NOT EDIT BY HAND.
 *
 * Source of truth: src/lib/palettes.js
 * Regenerate:      node scripts/gen-palettes.mjs
 *
 * ${PALETTE_IDS.length} palettes x ${MODES.length} modes. Token names match the pre-v0.4 set so
 * existing components keep working; --hc-room-1..9 and --hc-cat-0..8 carry the
 * validated categorical ramps.
 */

@layer base {
${blocks.join('\n\n')}
}
`;
}

const css = generate();

if (process.argv.includes('--check')) {
  const current = existsSync(OUT) ? readFileSync(OUT, 'utf8') : '';
  if (current !== css) {
    console.error('palettes.css is stale — run: node scripts/gen-palettes.mjs');
    process.exit(1);
  }
  console.log('palettes.css is up to date');
} else {
  writeFileSync(OUT, css);
  console.log(`wrote ${OUT} — ${PALETTE_IDS.length} palettes x ${MODES.length} modes`);
}
