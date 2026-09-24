export const CHAPTER_TWO_TRIGGER_IDS = [
  'T01',
  'T02',
  'T03',
  'T04',
  'T05',
  'T06',
  'T07',
  'T08',
  'T09',
  'T10',
  'T11',
  'T12',
  'T13',
  'T14',
] as const;

export type ChapterTwoTriggerId = (typeof CHAPTER_TWO_TRIGGER_IDS)[number];

export interface ChapterTwoSaveState {
  pose: { x: number; z: number; yaw: number };
  completedTriggers: ChapterTwoTriggerId[];
  fireHandleCollected: boolean;
  fireDoorOpened: boolean;
  room303KeyCollected: boolean;
}

export const CHAPTER_TWO_START_POSE = { x: 0, z: 1.2, yaw: 0 } as const;

export function createChapterTwoStartState(): ChapterTwoSaveState {
  return {
    pose: { ...CHAPTER_TWO_START_POSE },
    completedTriggers: ['T01'],
    fireHandleCollected: false,
    fireDoorOpened: false,
    room303KeyCollected: false,
  };
}

export function hasChapterTwoTrigger(
  state: ChapterTwoSaveState,
  trigger: ChapterTwoTriggerId,
): boolean {
  return state.completedTriggers.includes(trigger);
}

export function completeChapterTwoTrigger(
  state: ChapterTwoSaveState,
  trigger: ChapterTwoTriggerId,
): ChapterTwoSaveState {
  if (hasChapterTwoTrigger(state, trigger)) return state;
  return { ...state, completedTriggers: [...state.completedTriggers, trigger] };
}

export function chapterTwoProgressPercent(state: ChapterTwoSaveState): number {
  return Math.round((state.completedTriggers.length / CHAPTER_TWO_TRIGGER_IDS.length) * 100);
}

export function corridorHighLookLimit(z: number): number {
  return z <= -10.1 && z >= -14.6 ? 0.5 : 1;
}

export function shouldTriggerHypoxiaDeath(highLookDuration: number, z: number): boolean {
  return highLookDuration >= corridorHighLookLimit(z) + 1.25;
}

export function isChapterTwoSaveState(value: unknown): value is ChapterTwoSaveState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<ChapterTwoSaveState>;
  const pose = candidate.pose;
  return Boolean(
    pose &&
    Number.isFinite(pose.x) &&
    Number.isFinite(pose.z) &&
    Number.isFinite(pose.yaw) &&
    Array.isArray(candidate.completedTriggers) &&
    candidate.completedTriggers.every(
      (trigger) => typeof trigger === 'string' &&
        CHAPTER_TWO_TRIGGER_IDS.includes(trigger as ChapterTwoTriggerId),
    ) &&
    typeof candidate.fireHandleCollected === 'boolean' &&
    typeof candidate.fireDoorOpened === 'boolean' &&
    typeof candidate.room303KeyCollected === 'boolean'
  );
}
