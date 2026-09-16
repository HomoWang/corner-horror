export const BED_BLOOD_HOLD_MS = 2400;

export function clearBedDeathInventory<T>(slots: Array<T | null>): void {
  slots.fill(null);
}

export function buildBedDeathRestartUrl(currentHref: string, roomCode: string): string {
  const restartUrl = new URL(currentHref);
  restartUrl.searchParams.set('room', roomCode);
  restartUrl.searchParams.set('restart', 'death');
  restartUrl.searchParams.delete('inspect');
  return restartUrl.toString();
}
