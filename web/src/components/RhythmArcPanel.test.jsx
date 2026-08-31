import { describe, it, expect } from 'vitest';
import { GEOMETRY } from './RhythmArcPanel.jsx';

/**
 * The dial's labels are positioned by arithmetic, so the arithmetic is what
 * gets tested. The bug: "noon" was pinned at y=10 while the apex of a 10px
 * stroke sat at y=14 — the label ran through the arc. Nothing caught it,
 * because a label overlapping a path is invisible to the DOM.
 */
const {
  R, CX, CY, STROKE, DOT_R, DOT_STROKE, FONT_SIZE, VIEWBOX_H, NOON_LABEL_Y, EDGE_LABEL_Y,
} = GEOMETRY;

// SVG `y` on <text> is the BASELINE. Cap height is roughly the font size, and
// descenders fall a little below; both matter for a clearance check.
const textTop = (baseline) => baseline - FONT_SIZE;
const textBottom = (baseline) => baseline + FONT_SIZE * 0.25;

const arcApexTop = CY - R - STROKE / 2;
const arcEndsBottom = CY + STROKE / 2;
// The "now" dot is the widest thing on the dial; at noon it sits at the apex.
const dotTopAtNoon = (CY - R) - DOT_R - DOT_STROKE / 2;

describe('rhythm arc geometry', () => {
  it('keeps the noon label clear of the arc', () => {
    expect(textBottom(NOON_LABEL_Y)).toBeLessThan(arcApexTop);
  });

  // Regression: the reported overlap was exactly this.
  it('leaves a visible gap, not merely a touching edge', () => {
    expect(arcApexTop - textBottom(NOON_LABEL_Y)).toBeGreaterThanOrEqual(3);
  });

  it('keeps the noon label clear of the now dot when now IS noon', () => {
    expect(textBottom(NOON_LABEL_Y)).toBeLessThan(dotTopAtNoon);
  });

  it('keeps the midnight labels below the arc ends', () => {
    expect(textTop(EDGE_LABEL_Y)).toBeGreaterThan(arcEndsBottom);
  });

  it('fits every label inside the viewBox', () => {
    expect(textTop(NOON_LABEL_Y)).toBeGreaterThanOrEqual(0);
    expect(textBottom(EDGE_LABEL_Y)).toBeLessThanOrEqual(VIEWBOX_H);
  });

  it('fits the whole dial, stroke included, inside the viewBox', () => {
    expect(arcApexTop).toBeGreaterThanOrEqual(0);
    expect(arcEndsBottom).toBeLessThanOrEqual(VIEWBOX_H);
    expect(CX + R + STROKE / 2).toBeLessThanOrEqual(200);
  });
});
