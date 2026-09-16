import { describe, expect, it } from 'vitest';
import {
  createShakeDetectorState,
  detectShakeImpulse,
  type ShakeDetectorState,
} from '../src/prototype/shake-detector';

describe('phone shake detector', () => {
  it('ignores gravity and ordinary small motion', () => {
    let state = createShakeDetectorState();
    for (let index = 0; index < 12; index += 1) {
      const result = detectShakeImpulse(
        state,
        { x: 0.2, y: 0.15, z: 9.75, time: index * 20 },
        false,
      );
      state = result.state;
      expect(result.intensity).toBeNull();
    }
  });

  it('emits a bounded impulse for a deliberate shake', () => {
    const result = detectShakeImpulse(
      createShakeDetectorState(),
      { x: 11, y: 4, z: 2, time: 500 },
      true,
    );
    expect(result.intensity).not.toBeNull();
    expect(result.intensity).toBeGreaterThanOrEqual(0);
    expect(result.intensity).toBeLessThanOrEqual(1);
  });

  it('requires a forceful motion instead of an ordinary phone adjustment', () => {
    const result = detectShakeImpulse(
      createShakeDetectorState(),
      { x: 6.8, y: 0.6, z: 0.4, time: 500 },
      true,
    );
    expect(result.intensity).toBeNull();
  });

  it('applies cooldown so one swing cannot count repeatedly', () => {
    let state: ShakeDetectorState = createShakeDetectorState();
    const first = detectShakeImpulse(state, { x: 10, y: 0, z: 0, time: 1000 }, true);
    state = first.state;
    const repeated = detectShakeImpulse(state, { x: -10, y: 0, z: 0, time: 1060 }, true);
    const nextSwing = detectShakeImpulse(state, { x: -10, y: 0, z: 0, time: 1140 }, true);
    expect(first.intensity).not.toBeNull();
    expect(repeated.intensity).toBeNull();
    expect(nextSwing.intensity).not.toBeNull();
  });
});
