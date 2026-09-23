import { describe, expect, it } from 'vitest';
import {
  corridorEntryOutcome,
  UNPROTECTED_CORRIDOR_DEATH_MS,
} from '../src/prototype/firefighter-equipment';

describe('firefighter equipment corridor gate', () => {
  it('kills the player who enters the smoke without wearing the gear', () => {
    expect(corridorEntryOutcome(false)).toBe('smoke-death');
    expect(UNPROTECTED_CORRIDOR_DEATH_MS).toBeGreaterThanOrEqual(1000);
    expect(UNPROTECTED_CORRIDOR_DEATH_MS).toBeLessThanOrEqual(2500);
  });

  it('allows an equipped player to enter the corridor', () => {
    expect(corridorEntryOutcome(true)).toBe('enter-corridor');
  });
});
