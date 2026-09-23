import { describe, expect, it } from 'vitest';
import { advanceCorridorPose, normalizeAngle, resolveCorridorObstacles } from '../src/corridor-motion';

const bounds = { minX: -1.34, maxX: 1.34, minZ: -21.35, maxZ: 1.55 };

describe('corridor movement', () => {
  it('walks forward along the corridor at the initial heading', () => {
    const next = advanceCorridorPose(
      { x: 0, z: 1.2, yaw: 0 },
      { forward: 1, turn: 0 },
      0.05,
      bounds,
    );
    expect(next.x).toBeCloseTo(0, 6);
    expect(next.z).toBeLessThan(1.2);
  });

  it('turns continuously before applying forward movement', () => {
    const next = advanceCorridorPose(
      { x: 0, z: 0, yaw: 0 },
      { forward: 1, turn: -1 },
      0.05,
      bounds,
    );
    expect(next.yaw).toBeGreaterThan(0);
    expect(next.x).toBeLessThan(0);
  });

  it('never allows the camera through the corridor walls or end caps', () => {
    const next = advanceCorridorPose(
      { x: 1.33, z: -21.34, yaw: -Math.PI / 4 },
      { forward: 1, turn: 0 },
      0.05,
      bounds,
    );
    expect(next.x).toBeLessThanOrEqual(bounds.maxX);
    expect(next.z).toBeGreaterThanOrEqual(bounds.minZ);
  });

  it('keeps the player footprint outside an open cabinet door', () => {
    const door = { ax: 1.516, az: -9.62, bx: 0.81, bz: -9.81 };
    const inside = resolveCorridorObstacles({ x: 1.1, z: -9.7, yaw: 0 }, 0.34, [door], bounds);
    const closestT = Math.max(0, Math.min(1,
      ((inside.x - door.ax) * (door.bx - door.ax) + (inside.z - door.az) * (door.bz - door.az))
      / ((door.bx - door.ax) ** 2 + (door.bz - door.az) ** 2)));
    const distance = Math.hypot(
      inside.x - (door.ax + (door.bx - door.ax) * closestT),
      inside.z - (door.az + (door.bz - door.az) * closestT),
    );
    expect(distance).toBeGreaterThanOrEqual(0.34 - 1e-9);
  });

  it('leaves poses clear of obstacles untouched and keeps pushes inside the corridor', () => {
    const cabinet = { ax: 1.52, az: -9.625, bx: 1.52, bz: -8.875 };
    const clear = resolveCorridorObstacles({ x: 0, z: -9.25, yaw: 0.4 }, 0.34, [cabinet], bounds);
    expect(clear).toEqual({ x: 0, z: -9.25, yaw: 0.4 });
    const pushed = resolveCorridorObstacles({ x: 1.34, z: -9.25, yaw: 0 }, 0.34, [cabinet], bounds);
    expect(pushed.x).toBeCloseTo(1.18, 6);
    const onSegment = resolveCorridorObstacles({ x: 1.0, z: -9.0, yaw: 0 }, 0.34, [{ ax: 0.8, az: -9, bx: 1.2, bz: -9 }], bounds);
    expect(Math.abs(onSegment.z + 9)).toBeCloseTo(0.34, 6);
  });

  it('normalizes accumulated rotation', () => {
    expect(normalizeAngle(Math.PI * 3)).toBeCloseTo(Math.PI);
    expect(normalizeAngle(-Math.PI * 3)).toBeCloseTo(-Math.PI);
  });
});
