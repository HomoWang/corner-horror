export interface CorridorPose {
  x: number;
  z: number;
  yaw: number;
}

export interface CorridorMotionInput {
  forward: number;
  turn: number;
}

export interface CorridorBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

const WALK_SPEED = 1.52;
const TURN_SPEED = 1.58;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

export function normalizeAngle(angle: number): number {
  let normalized = angle;
  while (normalized > Math.PI) normalized -= Math.PI * 2;
  while (normalized < -Math.PI) normalized += Math.PI * 2;
  return normalized;
}

/** A thin vertical obstacle (cabinet face, open door leaf) seen from above as an XZ segment. */
export interface CorridorObstacle {
  ax: number;
  az: number;
  bx: number;
  bz: number;
}

/** Pushes the player's circular footprint out of every obstacle segment, then re-applies the corridor bounds. */
export function resolveCorridorObstacles(
  pose: CorridorPose,
  radius: number,
  obstacles: readonly CorridorObstacle[],
  bounds: CorridorBounds,
): CorridorPose {
  let x = pose.x;
  let z = pose.z;
  for (const obstacle of obstacles) {
    const segmentX = obstacle.bx - obstacle.ax;
    const segmentZ = obstacle.bz - obstacle.az;
    const lengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    const t = lengthSquared > 0
      ? clamp(((x - obstacle.ax) * segmentX + (z - obstacle.az) * segmentZ) / lengthSquared, 0, 1)
      : 0;
    const closestX = obstacle.ax + segmentX * t;
    const closestZ = obstacle.az + segmentZ * t;
    const distance = Math.hypot(x - closestX, z - closestZ);
    if (distance >= radius) continue;
    if (distance < 1e-6) {
      // Standing exactly on the segment: leave along its left-hand normal.
      const length = Math.sqrt(lengthSquared) || 1;
      x = closestX - (segmentZ / length) * radius;
      z = closestZ + (segmentX / length) * radius;
      continue;
    }
    x = closestX + ((x - closestX) / distance) * radius;
    z = closestZ + ((z - closestZ) / distance) * radius;
  }
  return {
    x: clamp(x, bounds.minX, bounds.maxX),
    z: clamp(z, bounds.minZ, bounds.maxZ),
    yaw: pose.yaw,
  };
}

export function advanceCorridorPose(
  pose: CorridorPose,
  input: CorridorMotionInput,
  deltaSeconds: number,
  bounds: CorridorBounds,
): CorridorPose {
  const delta = clamp(deltaSeconds, 0, 0.05);
  const turn = clamp(input.turn, -1, 1);
  const forward = clamp(input.forward, -1, 1);
  const yaw = normalizeAngle(pose.yaw - turn * TURN_SPEED * delta);
  const distance = forward * WALK_SPEED * delta;

  return {
    x: clamp(pose.x - Math.sin(yaw) * distance, bounds.minX, bounds.maxX),
    z: clamp(pose.z - Math.cos(yaw) * distance, bounds.minZ, bounds.maxZ),
    yaw,
  };
}
