export type PendantObjectiveId = 'find' | 'install' | 'use';
export type StoryObjectiveId = PendantObjectiveId | 'equipFirefighterGear';

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

export const STORY_OBJECTIVE_LABELS: Record<StoryObjectiveId, string> = {
  ...PENDANT_OBJECTIVE_LABELS,
  equipFirefighterGear: '穿戴完整消防裝備',
};

export function nextPendantObjective(state: PendantObjectiveState): PendantObjectiveId | null {
  if (!state.hasPendant) return 'find';
  if (!state.powered) return 'install';
  if (!state.doorScareCompleted) return null;
  if (!state.activated) return 'use';
  return null;
}

export function nextStoryObjective(
  pendant: PendantObjectiveState,
  equipment: { hasCompleteGear: boolean; equipped: boolean },
): StoryObjectiveId | null {
  if (equipment.hasCompleteGear && !equipment.equipped) return 'equipFirefighterGear';
  return nextPendantObjective(pendant);
}
