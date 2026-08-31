import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import {
  PALETTES,
  PALETTE_IDS,
  RAMPS,
  ACHROMATIC_RAMPS,
  MODES,
  DEFAULT_PALETTE,
  ACCENT_TO_PALETTE,
  isPaletteId,
  resolvePaletteId,
  rampFor,
  buildTokens,
} from './palettes.js';
import { contrastRatio, hexToOklch, mix, parseHex, toHex } from './color.js';

const HEX = /^#[0-9a-f]{6}$/;
const REPO_WEB = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

describe('color utilities', () => {
  it('round-trips hex through parse and format', () => {
    expect(toHex(parseHex('#1a56c4'))).toBe('#1a56c4');
  });

  it('expands shorthand hex', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255]);
  });

  it('rejects malformed hex', () => {
    expect(() => parseHex('#12345')).toThrow(/malformed/);
    expect(() => parseHex('nope')).toThrow(/malformed/);
  });

  it('mixes toward the target color', () => {
    expect(mix('#000000', '#ffffff', 0)).toBe('#000000');
    expect(mix('#000000', '#ffffff', 1)).toBe('#ffffff');
    const half = hexToOklch(mix('#000000', '#ffffff', 0.5)).L;
    expect(half).toBeGreaterThan(0.4);
    expect(half).toBeLessThan(0.6);
  });

  it('computes known WCAG contrast ratios', () => {
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 1);
    expect(contrastRatio('#ffffff', '#ffffff')).toBeCloseTo(1, 5);
  });
});

describe('palette registry', () => {
  it('defines twelve palettes', () => {
    expect(PALETTE_IDS).toHaveLength(12);
  });

  it('has a valid default', () => {
    expect(isPaletteId(DEFAULT_PALETTE)).toBe(true);
  });

  it.each(PALETTE_IDS)('%s declares complete, well-formed anchors for both modes', (id) => {
    const palette = PALETTES[id];
    expect(palette.name).toBeTruthy();
    expect(palette.tagline).toBeTruthy();
    expect(RAMPS[palette.ramp]).toBeDefined();

    for (const mode of MODES) {
      const anchors = palette[mode];
      expect(anchors, `${id}.${mode}`).toBeDefined();
      for (const key of ['bg', 'panel', 'border', 'ink', 'muted', 'accent']) {
        expect(anchors[key], `${id}.${mode}.${key}`).toMatch(HEX);
      }
    }
  });

  it('maps every legacy accent to a real palette', () => {
    const legacy = ['ocean', 'graphite', 'sunrise', 'red', 'yellow', 'purple', 'slate', 'pink'];
    for (const accent of legacy) {
      expect(ACCENT_TO_PALETTE[accent], `accent ${accent}`).toBeDefined();
      expect(isPaletteId(ACCENT_TO_PALETTE[accent]), `accent ${accent}`).toBe(true);
    }
  });

  it('resolves stored values to a valid palette id', () => {
    expect(resolvePaletteId('dusk')).toBe('dusk');
    expect(resolvePaletteId('ocean')).toBe('tide'); // legacy accent upgrade
    expect(resolvePaletteId('nonsense')).toBe(DEFAULT_PALETTE);
    expect(resolvePaletteId(null)).toBe(DEFAULT_PALETTE);
    expect(resolvePaletteId(undefined)).toBe(DEFAULT_PALETTE);
  });
});

describe('categorical ramps', () => {
  it.each(Object.keys(RAMPS))('%s ramp has nine well-formed slots per mode', (name) => {
    for (const mode of MODES) {
      const ramp = RAMPS[name][mode];
      expect(ramp, `${name}.${mode}`).toHaveLength(9);
      ramp.forEach((hex, i) => expect(hex, `${name}.${mode}[${i}]`).toMatch(HEX));
      expect(new Set(ramp).size, `${name}.${mode} has duplicate slots`).toBe(9);
    }
  });

  it.each(Object.keys(RAMPS).filter((r) => !ACHROMATIC_RAMPS.has(r)))(
    '%s ramp slots are chromatic enough not to read as grey',
    (name) => {
      for (const mode of MODES) {
        for (const hex of RAMPS[name][mode]) {
          expect(hexToOklch(hex).C, `${name}.${mode} ${hex} chroma`).toBeGreaterThanOrEqual(0.09);
        }
      }
    },
  );

  it('resolves a ramp for every palette and mode', () => {
    for (const id of PALETTE_IDS) {
      for (const mode of MODES) {
        expect(rampFor(id, mode)).toHaveLength(9);
      }
    }
  });

  it('rejects an unknown palette', () => {
    expect(() => rampFor('chartreuse', 'light')).toThrow(/unknown palette/);
  });
});

describe('token derivation', () => {
  const REQUIRED = [
    'bg', 'panel', 'panel-soft', 'panel-mid', 'panel-hover', 'panel-border',
    'border-strong', 'shadow', 'fg', 'fg-strong', 'muted', 'muted-light',
    'accent-rgb', 'accent-soft', 'accent-strong', 'accent-stronger',
    'glow-1', 'glow-2', 'chart-tick', 'chart-grid', 'chart-label',
    'chart-sublabel', 'tooltip-bg', 'tooltip-text', 'tooltip-border',
    'room-fallback',
    ...Array.from({ length: 9 }, (_, i) => `room-${i + 1}`),
    ...Array.from({ length: 9 }, (_, i) => `room-${i + 1}-soft`),
    ...Array.from({ length: 9 }, (_, i) => `room-${i + 1}-text`),
    ...Array.from({ length: 9 }, (_, i) => `cat-${i}`),
  ];

  it.each(PALETTE_IDS)('%s emits every required token in both modes', (id) => {
    for (const mode of MODES) {
      const tokens = buildTokens(id, mode);
      for (const key of REQUIRED) {
        expect(tokens[key], `${id}.${mode} --hc-${key}`).toBeTruthy();
      }
    }
  });

  it('aliases the chart-category tokens onto the room ramp', () => {
    for (const id of PALETTE_IDS) {
      for (const mode of MODES) {
        const tokens = buildTokens(id, mode);
        const ramp = rampFor(id, mode);
        ramp.forEach((hex, i) => {
          expect(tokens[`room-${i + 1}`]).toBe(hex);
          expect(tokens[`cat-${i}`]).toBe(hex);
        });
      }
    }
  });

  it('rejects unknown palettes and modes', () => {
    expect(() => buildTokens('chartreuse', 'light')).toThrow(/unknown palette/);
    expect(() => buildTokens('dusk', 'sepia')).toThrow(/unknown mode/);
  });
});

// PAL-08: every palette must be readable against its own surfaces, in both
// modes. These are the checks a palette can actually fail, so they assert real
// WCAG thresholds rather than merely that a value exists.
describe('contrast (PAL-08)', () => {
  it.each(PALETTE_IDS)('%s body text meets WCAG AA on page and panel', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      expect(contrastRatio(t.fg, t.bg), `${id}.${mode} fg/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.fg, t.panel), `${id}.${mode} fg/panel`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(PALETTE_IDS)('%s secondary text meets WCAG AA on page and panel', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      expect(contrastRatio(t.muted, t.bg), `${id}.${mode} muted/bg`).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(t.muted, t.panel), `${id}.${mode} muted/panel`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(PALETTE_IDS)('%s accent is usable as a UI colour against page background', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      // 3:1 is the WCAG threshold for non-text UI components and graphics.
      expect(contrastRatio(t['accent-strong'], t.bg), `${id}.${mode} accent/bg`).toBeGreaterThanOrEqual(3);
    }
  });

  // Room badges are colour-on-colour, so they need their own check: the badge
  // text must be readable on the badge's own tinted background, in every
  // palette, every mode, all nine slots. This includes the mono ramps, where
  // the tint is subtle and the risk is highest.
  it.each(PALETTE_IDS)('%s room badge text meets WCAG AA on its own tint', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      for (let slot = 1; slot <= 9; slot += 1) {
        const soft = t[`room-${slot}-soft`];
        const text = t[`room-${slot}-text`];
        expect(contrastRatio(text, soft), `${id}.${mode} room-${slot} text/soft`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  // A tint that measures ~1.05 against the panel is invisible — the pill
  // dissolves into the card. One slot measured 1.086 before a floor was added,
  // so this asserts the floor rather than mere inequality.
  it.each(PALETTE_IDS)('%s room badge tint reads as a shape against the panel', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      for (let slot = 1; slot <= 9; slot += 1) {
        const ratio = contrastRatio(t[`room-${slot}-soft`], t.panel);
        expect(ratio, `${id}.${mode} room-${slot} tint/panel`).toBeGreaterThanOrEqual(1.14);
        // ...but stay a tint, not a second accent competing with the text.
        expect(ratio, `${id}.${mode} room-${slot} tint too strong`).toBeLessThan(2.2);
      }
    }
  });

  it.each(PALETTE_IDS)('%s hairline border is visible against its surfaces', (id) => {
    for (const mode of MODES) {
      const t = buildTokens(id, mode);
      expect(contrastRatio(t['panel-border'], t.panel), `${id}.${mode} border/panel`).toBeGreaterThan(1.05);
    }
  });
});

describe('generated stylesheet', () => {
  it('is in sync with the palette module', () => {
    // Fails if someone edits palettes.js without re-running the generator.
    expect(() => {
      execFileSync('node', ['scripts/gen-palettes.mjs', '--check'], {
        cwd: REPO_WEB,
        stdio: 'pipe',
      });
    }).not.toThrow();
  });

  it('defines a block for every palette and mode', () => {
    const css = readFileSync(join(REPO_WEB, 'src', 'palettes.css'), 'utf8');
    for (const id of PALETTE_IDS) {
      expect(css, `${id} light`).toContain(`html[data-palette='${id}']`);
      expect(css, `${id} dark`).toContain(`html.theme-dark[data-palette='${id}']`);
    }
  });

  // Regression guard for a cascade bug found in the browser, which no unit test
  // could have caught: the legacy --hc-cat-* defaults lived in an UNLAYERED
  // :root block at the bottom of index.css. Unlayered styles beat layered ones
  // regardless of specificity, so those defaults silently overrode every
  // palette and pinned all chart categories to the old fixed colors.
  // Any --hc-cat-*/--hc-room-* fallback must therefore stay inside @layer.
  it('keeps categorical fallbacks inside a cascade layer in index.css', () => {
    const css = readFileSync(join(REPO_WEB, 'src', 'index.css'), 'utf8');

    let depth = 0;
    let inLayer = false;
    let layerDepth = 0;
    const offenders = [];

    css.split('\n').forEach((line, i) => {
      if (/^\s*@layer\b/.test(line) && line.includes('{')) {
        inLayer = true;
        layerDepth = depth;
      }
      if (/--hc-(cat|room)-\d+\s*:/.test(line) && !inLayer) {
        offenders.push(`${i + 1}: ${line.trim()}`);
      }
      depth += (line.match(/\{/g) || []).length;
      depth -= (line.match(/\}/g) || []).length;
      if (inLayer && depth <= layerDepth) inLayer = false;
    });

    expect(offenders, 'unlayered categorical tokens override every palette').toEqual([]);
  });
});
