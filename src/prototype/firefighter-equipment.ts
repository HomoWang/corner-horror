export const UNPROTECTED_CORRIDOR_DEATH_MS = 1800;

export type CorridorEntryOutcome = 'enter-corridor' | 'smoke-death';

export function corridorEntryOutcome(firefighterGearEquipped: boolean): CorridorEntryOutcome {
  return firefighterGearEquipped ? 'enter-corridor' : 'smoke-death';
}
