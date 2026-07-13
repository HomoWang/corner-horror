import { describe, expect, it } from 'vitest';
import {
  applyHomography,
  computeUnitSquareHomography,
  DEFAULT_PROJECTION_CORNERS,
  invertHomography,
  isProjectionCorners,
  parseProjectionCorners,
  toRenderQuad,
  type NormalizedPoint,
} from '../src/shared/calibration';

function expectPoint(actual: NormalizedPoint, expected: NormalizedPoint): void {
  expect(actual.x).toBeCloseTo(expected.x, 8);
  expect(actual.y).toBeCloseTo(expected.y, 8);
}

describe('projection calibration', () => {
  it('accepts the default convex quad and rejects crossed or tiny quads', () => {
    expect(isProjectionCorners(DEFAULT_PROJECTION_CORNERS)).toBe(true);
    expect(
      isProjectionCorners({
        tl: { x: 0, y: 0 },
        tr: { x: 1, y: 1 },
        br: { x: 1, y: 0 },
        bl: { x: 0, y: 1 },
      }),
    ).toBe(false);
    expect(
      isProjectionCorners({
        tl: { x: 0.5, y: 0.5 },
        tr: { x: 0.51, y: 0.5 },
        br: { x: 0.51, y: 0.51 },
        bl: { x: 0.5, y: 0.51 },
      }),
    ).toBe(false);
  });

  it('parses only valid persisted settings', () => {
    expect(parseProjectionCorners(JSON.stringify(DEFAULT_PROJECTION_CORNERS))).toEqual(DEFAULT_PROJECTION_CORNERS);
    expect(parseProjectionCorners('{bad json')).toBeNull();
    expect(parseProjectionCorners(JSON.stringify({ tl: { x: 2, y: 0 } }))).toBeNull();
  });

  it('maps every unit-square corner to the requested projection corner', () => {
    const quad: NormalizedPoint[] = [
      { x: 0.08, y: 0.12 },
      { x: 0.94, y: 0.03 },
      { x: 0.82, y: 0.91 },
      { x: 0.17, y: 0.82 },
    ];
    const matrix = computeUnitSquareHomography(quad);
    const sourceCorners: NormalizedPoint[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 0, y: 1 },
    ];
    sourceCorners.forEach((source, index) => expectPoint(applyHomography(matrix, source), quad[index]!));
  });

  it('inverse homography maps output positions back to scene UVs', () => {
    const quad = toRenderQuad({
      tl: { x: 0.1, y: 0.2 },
      tr: { x: 0.9, y: 0.1 },
      br: { x: 0.8, y: 0.85 },
      bl: { x: 0.2, y: 0.9 },
    });
    const forward = computeUnitSquareHomography(quad);
    const inverse = invertHomography(forward);
    const source = { x: 0.37, y: 0.64 };
    expectPoint(applyHomography(inverse, applyHomography(forward, source)), source);
  });
});

