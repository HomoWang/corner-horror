export interface NormalizedPoint {
  x: number;
  y: number;
}

export interface ProjectionCorners {
  tl: NormalizedPoint;
  tr: NormalizedPoint;
  br: NormalizedPoint;
  bl: NormalizedPoint;
}

export type CornerId = keyof ProjectionCorners;

export const DEFAULT_PROJECTION_CORNERS: ProjectionCorners = {
  tl: { x: 0, y: 0 },
  tr: { x: 1, y: 0 },
  br: { x: 1, y: 1 },
  bl: { x: 0, y: 1 },
};

export function cloneCorners(corners: ProjectionCorners): ProjectionCorners {
  return {
    tl: { ...corners.tl },
    tr: { ...corners.tr },
    br: { ...corners.br },
    bl: { ...corners.bl },
  };
}

export function isProjectionCorners(value: unknown): value is ProjectionCorners {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  const ids: CornerId[] = ['tl', 'tr', 'br', 'bl'];
  const points: NormalizedPoint[] = [];

  for (const id of ids) {
    const point = record[id];
    if (typeof point !== 'object' || point === null) return false;
    const { x, y } = point as Record<string, unknown>;
    if (
      typeof x !== 'number' ||
      typeof y !== 'number' ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      x < 0 ||
      x > 1 ||
      y < 0 ||
      y > 1
    ) {
      return false;
    }
    points.push({ x, y });
  }

  const crosses = points.map((point, index) => {
    const next = points[(index + 1) % points.length]!;
    const after = points[(index + 2) % points.length]!;
    return (next.x - point.x) * (after.y - next.y) - (next.y - point.y) * (after.x - next.x);
  });
  const consistentWinding = crosses.every((cross) => cross > 0.0001) || crosses.every((cross) => cross < -0.0001);
  if (!consistentWinding) return false;

  let twiceArea = 0;
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += point.x * next.y - next.x * point.y;
  }
  return Math.abs(twiceArea) > 0.02;
}

export function parseProjectionCorners(raw: string | null): ProjectionCorners | null {
  if (raw === null) return null;
  try {
    const value: unknown = JSON.parse(raw);
    return isProjectionCorners(value) ? cloneCorners(value) : null;
  } catch {
    return null;
  }
}

/** 將 DOM（左上為原點）的控制點轉成 WebGL（左下為原點）的 unit-square 順序。 */
export function toRenderQuad(corners: ProjectionCorners): NormalizedPoint[] {
  return [corners.bl, corners.br, corners.tr, corners.tl].map((point) => ({
    x: point.x,
    y: 1 - point.y,
  }));
}

/** unit square (0,0)-(1,1) 到任意凸四邊形的 3×3 homography，row-major。 */
export function computeUnitSquareHomography(quad: readonly NormalizedPoint[]): number[] {
  if (quad.length !== 4) throw new Error('Homography requires four points');
  const [p0, p1, p2, p3] = quad as [NormalizedPoint, NormalizedPoint, NormalizedPoint, NormalizedPoint];
  const dx1 = p1.x - p2.x;
  const dx2 = p3.x - p2.x;
  const dx3 = p0.x - p1.x + p2.x - p3.x;
  const dy1 = p1.y - p2.y;
  const dy2 = p3.y - p2.y;
  const dy3 = p0.y - p1.y + p2.y - p3.y;

  let g = 0;
  let h = 0;
  if (Math.abs(dx3) > 1e-10 || Math.abs(dy3) > 1e-10) {
    const denominator = dx1 * dy2 - dx2 * dy1;
    if (Math.abs(denominator) < 1e-10) throw new Error('Degenerate projection quad');
    g = (dx3 * dy2 - dx2 * dy3) / denominator;
    h = (dx1 * dy3 - dx3 * dy1) / denominator;
  }

  return [
    p1.x - p0.x + g * p1.x,
    p3.x - p0.x + h * p3.x,
    p0.x,
    p1.y - p0.y + g * p1.y,
    p3.y - p0.y + h * p3.y,
    p0.y,
    g,
    h,
    1,
  ];
}

export function invertHomography(matrix: readonly number[]): number[] {
  if (matrix.length !== 9) throw new Error('Expected a 3x3 matrix');
  const [a, b, c, d, e, f, g, h, i] = matrix as [number, number, number, number, number, number, number, number, number];
  const determinant = a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
  if (Math.abs(determinant) < 1e-12) throw new Error('Homography is not invertible');
  return [
    (e * i - f * h) / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    (f * g - d * i) / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    (d * h - e * g) / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

export function applyHomography(matrix: readonly number[], point: NormalizedPoint): NormalizedPoint {
  const denominator = matrix[6]! * point.x + matrix[7]! * point.y + matrix[8]!;
  return {
    x: (matrix[0]! * point.x + matrix[1]! * point.y + matrix[2]!) / denominator,
    y: (matrix[3]! * point.x + matrix[4]! * point.y + matrix[5]!) / denominator,
  };
}

