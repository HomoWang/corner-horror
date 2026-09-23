import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { describe, expect, it } from 'vitest';
import { buildFlatHose, projectCabinetUVs } from '../src/corridor-fire-hose';

const floorPoint = (x: number, z: number) => ({ position: new THREE.Vector3(x, 0, z), up: new THREE.Vector3(0, 1, 0) });

function drapedHose() {
  return buildFlatHose({
    points: [
      { position: new THREE.Vector3(1.51, 0.754, -9.36), up: new THREE.Vector3(-0.6, 0.8, 0) },
      { position: new THREE.Vector3(1.445, 0.55, -9.4), up: new THREE.Vector3(-1, 0.08, 0) },
      { position: new THREE.Vector3(1.41, 0.24, -9.44) },
      { position: new THREE.Vector3(1.35, 0.05, -9.49) },
      floorPoint(1.2, -9.56),
      floorPoint(1.0, -9.8),
      floorPoint(0.9, -10.25),
      floorPoint(0.98, -10.8),
    ],
  });
}

describe('lay-flat fire hose geometry', () => {
  it('rests on the floor instead of floating above it', () => {
    const { geometry, samples } = drapedHose();
    const positions = geometry.getAttribute('position');
    let lowest = Infinity;
    for (let index = 0; index < positions.count; index += 1) lowest = Math.min(lowest, positions.getY(index));
    expect(lowest).toBeGreaterThanOrEqual(0);
    expect(lowest).toBeLessThan(0.002);
    const floorSamples = samples.filter((sample) => sample.position.z < -9.9);
    expect(floorSamples.length).toBeGreaterThan(10);
    for (const sample of floorSamples) expect(sample.position.y).toBeLessThan(0.008);
  });

  it('lies on its flat face on the floor and never becomes a round tube there', () => {
    const { samples } = drapedHose();
    for (const sample of samples.filter((item) => item.position.z < -9.9)) {
      expect(Math.abs(sample.normal.y)).toBeGreaterThan(0.97);
      expect(sample.halfWidth / sample.halfThickness).toBeGreaterThan(4);
    }
  });

  it('projects rounded cabinet panels without stretching a triangle across the texture', () => {
    // A side panel of the cabinet (depth 0.2, height 1.05, sheet 0.014) at its corridor position.
    const panel = new RoundedBoxGeometry(0.2, 1.05, 0.014, 2, 0.006);
    projectCabinetUVs(panel, new THREE.Vector3(1.62, 1.245, -8.882), 0.72, 1.05);
    const uv = panel.getAttribute('uv');
    let widestSpan = 0;
    for (let vertex = 0; vertex < uv.count; vertex += 3) {
      const us = [uv.getX(vertex), uv.getX(vertex + 1), uv.getX(vertex + 2)];
      const vs = [uv.getY(vertex), uv.getY(vertex + 1), uv.getY(vertex + 2)];
      widestSpan = Math.max(widestSpan, Math.max(...us) - Math.min(...us), Math.max(...vs) - Math.min(...vs));
    }
    // One triangle spans at most the panel itself (~1 texture unit); mixed projections jump by ~9 units.
    expect(widestSpan).toBeLessThan(1.05);
  });

  it('produces orthonormal frames without NaN', () => {
    const { geometry, samples } = drapedHose();
    for (const sample of samples) {
      expect(sample.tangent.length()).toBeCloseTo(1, 5);
      expect(sample.normal.length()).toBeCloseTo(1, 5);
      expect(Math.abs(sample.normal.dot(sample.tangent))).toBeLessThan(1e-4);
    }
    const positions = geometry.getAttribute('position').array as Float32Array;
    expect(positions.every((value) => Number.isFinite(value))).toBe(true);
  });
});
