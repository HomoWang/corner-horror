import { describe, expect, it } from 'vitest';
import { nextPendantObjective } from '../src/prototype/pendant-objective';

describe('pendant story objective', () => {
  it('advances through finding and powering the pendant', () => {
    expect(
      nextPendantObjective({
        hasPendant: false,
        powered: false,
        doorScareCompleted: false,
        activated: false,
      }),
    ).toBe('find');
    expect(
      nextPendantObjective({
        hasPendant: true,
        powered: false,
        doorScareCompleted: false,
        activated: false,
      }),
    ).toBe('install');
  });

  it('waits for the door scare before asking the player to use the pendant', () => {
    expect(
      nextPendantObjective({
        hasPendant: true,
        powered: true,
        doorScareCompleted: false,
        activated: false,
      }),
    ).toBeNull();
    expect(
      nextPendantObjective({
        hasPendant: true,
        powered: true,
        doorScareCompleted: true,
        activated: false,
      }),
    ).toBe('use');
  });

  it('clears the objective after the pendant is used', () => {
    expect(
      nextPendantObjective({
        hasPendant: true,
        powered: true,
        doorScareCompleted: true,
        activated: true,
      }),
    ).toBeNull();
  });
});
