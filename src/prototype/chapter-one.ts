export interface ChapterOneRoomProgress {
  safeUnlocked: boolean;
  photoMounted: boolean;
  tapePlayed: boolean;
  pendantActivated: boolean;
  radioBroadcastHeard: boolean;
}

export const SAFE_CODE = '4826';
export const SAFE_WORN_DIGITS = ['4', '8', '2', '6'] as const;

export const receiptCodeClues = [
  { guess: '2714', exact: 0, misplaced: 2 },
  { guess: '7142', exact: 0, misplaced: 2 },
  { guess: '5801', exact: 1, misplaced: 0 },
] as const;

export type TapeVoiceClipId = 'girlfriendIntro' | 'girlfriendReply' | 'girlfriendDistortedTail';

interface TapeRecordingLine {
  source: string;
  text: string;
  duration: number;
  clip?: TapeVoiceClipId;
  distorted?: boolean;
}

export const tapeRecordingLines: readonly TapeRecordingLine[] = [
  {
    source: '女友(錄音)',
    text: '你每次都說，晚一步就會失去誰。',
    duration: 4400,
    clip: 'girlfriendIntro',
  },
  {
    source: '女友(錄音)',
    text: '可是你有沒有想過，如果你回不來，留下來的人怎麼辦？',
    duration: 7600,
  },
  { source: '男主(錄音)', text: '我會回來。', duration: 2200 },
  {
    source: '女友(錄音)',
    text: '你每次都這樣說。',
    duration: 3200,
    clip: 'girlfriendReply',
  },
  {
    source: '收錄音機(失真聲音)',
    text: '可是這一次……你沒有。',
    duration: 6000,
    clip: 'girlfriendDistortedTail',
    distorted: true,
  },
  { source: '主角(聲音)', text: '不對……後面不是這句。', duration: 3000 },
];

export function canUnlockRoomDoor(progress: ChapterOneRoomProgress): boolean {
  return (
    progress.safeUnlocked &&
    progress.photoMounted &&
    progress.tapePlayed &&
    progress.pendantActivated &&
    progress.radioBroadcastHeard
  );
}
