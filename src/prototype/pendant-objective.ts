export type PendantObjectiveId = 'find' | 'install' | 'use';

export interface PendantObjectiveState {
  hasPendant: boolean;
  powered: boolean;
  doorScareCompleted: boolean;
  activated: boolean;
}

export const PENDANT_OBJECTIVE_LABELS: Record<PendantObjectiveId, string> = {
  find: '找到錄音吊飾',
  install: '將錄音吊飾裝上電池',
  use: '使用錄音吊飾',
};

export function nextPendantObjective(state: PendantObjectiveState): PendantObjectiveId | null {
  if (!state.hasPendant) return 'find';
  if (!state.powered) return 'install';
  if (!state.doorScareCompleted) return null;
  if (!state.activated) return 'use';
  return null;
}
