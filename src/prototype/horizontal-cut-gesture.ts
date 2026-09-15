export interface HorizontalCutGesture {
  startX: number;
  startY: number;
  furthestDistance: number;
  lastX: number;
  direction: -1 | 0 | 1;
  startedAt: number;
  progress: number;
}

export type HorizontalCutResult =
  | { status: 'active'; gesture: HorizontalCutGesture }
  | { status: 'completed'; gesture: HorizontalCutGesture }
  | { status: 'cancelled'; gesture: HorizontalCutGesture };

const START_EDGE_PADDING = 0.06;
const START_Y_MIN = 0.08;
const START_Y_MAX = 0.92;
const TRACK_Y_PADDING = 0.42;
const REQUIRED_DISTANCE = 0.46;
const DIRECTION_LOCK_DISTANCE = 0.035;
const MAX_REVERSE_DISTANCE = 0.14;
const MIN_DURATION_MS = 120;
const MAX_DURATION_MS = 8000;

export function beginHorizontalCut(
  x: number,
  y: number,
  now: number,
): HorizontalCutGesture | null {
  if (
    x < START_EDGE_PADDING ||
    x > 1 - START_EDGE_PADDING ||
    y < START_Y_MIN ||
    y > START_Y_MAX
  ) return null;

  return {
    startX: x,
    startY: y,
    furthestDistance: 0,
    lastX: x,
    direction: 0,
    startedAt: now,
    progress: 0,
  };
}

export function advanceHorizontalCut(
  gesture: HorizontalCutGesture,
  x: number,
  y: number,
  now: number,
): HorizontalCutResult {
  const elapsed = now - gesture.startedAt;
  const totalDelta = x - gesture.startX;
  const nextDirection: -1 | 0 | 1 =
    gesture.direction !== 0
      ? gesture.direction
      : Math.abs(totalDelta) >= DIRECTION_LOCK_DISTANCE
        ? totalDelta > 0 ? 1 : -1
        : 0;
  const directedDistance = nextDirection === 0 ? 0 : totalDelta * nextDirection;
  const lastDirectedDistance = nextDirection === 0
    ? 0
    : (gesture.lastX - gesture.startX) * nextDirection;

  if (
    elapsed > MAX_DURATION_MS ||
    x < -0.08 ||
    x > 1.08 ||
    Math.abs(y - gesture.startY) > TRACK_Y_PADDING ||
    (nextDirection !== 0 && directedDistance < lastDirectedDistance - MAX_REVERSE_DISTANCE)
  ) {
    return { status: 'cancelled', gesture };
  }

  const furthestDistance = Math.max(gesture.furthestDistance, directedDistance);
  const progress = Math.min(1, furthestDistance / REQUIRED_DISTANCE);
  const nextGesture = {
    ...gesture,
    furthestDistance,
    lastX: x,
    direction: nextDirection,
    progress,
  };

  if (progress >= 1 && elapsed >= MIN_DURATION_MS) {
    return { status: 'completed', gesture: nextGesture };
  }
  return { status: 'active', gesture: nextGesture };
}
