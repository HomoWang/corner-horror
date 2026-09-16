export interface ShakeSample {
  x: number;
  y: number;
  z: number;
  time: number;
}

export interface ShakeDetectorState {
  gravity: [number, number, number] | null;
  lastImpulseAt: number;
}

export interface ShakeDetection {
  state: ShakeDetectorState;
  intensity: number | null;
}

const GRAVITY_BLEND = 0.82;
const IMPULSE_THRESHOLD = 7.4;
const MAX_IMPULSE = 22;
const IMPULSE_COOLDOWN_MS = 140;

export function createShakeDetectorState(): ShakeDetectorState {
  return { gravity: null, lastImpulseAt: -Infinity };
}

export function detectShakeImpulse(
  state: ShakeDetectorState,
  sample: ShakeSample,
  accelerationExcludesGravity: boolean,
): ShakeDetection {
  let linearX = sample.x;
  let linearY = sample.y;
  let linearZ = sample.z;
  let gravity = state.gravity;

  if (!accelerationExcludesGravity) {
    const previous = gravity ?? [sample.x, sample.y, sample.z];
    gravity = [
      previous[0] * GRAVITY_BLEND + sample.x * (1 - GRAVITY_BLEND),
      previous[1] * GRAVITY_BLEND + sample.y * (1 - GRAVITY_BLEND),
      previous[2] * GRAVITY_BLEND + sample.z * (1 - GRAVITY_BLEND),
    ];
    linearX = sample.x - gravity[0];
    linearY = sample.y - gravity[1];
    linearZ = sample.z - gravity[2];
  }

  const magnitude = Math.hypot(linearX, linearY, linearZ);
  const nextState = { gravity, lastImpulseAt: state.lastImpulseAt };
  if (
    magnitude < IMPULSE_THRESHOLD ||
    sample.time - state.lastImpulseAt < IMPULSE_COOLDOWN_MS
  ) {
    return { state: nextState, intensity: null };
  }

  nextState.lastImpulseAt = sample.time;
  return {
    state: nextState,
    intensity: Math.min(1, (magnitude - IMPULSE_THRESHOLD) / (MAX_IMPULSE - IMPULSE_THRESHOLD)),
  };
}
