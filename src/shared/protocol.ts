// WebSocket 訊息協定：所有進出 relay 的訊息都經過 parseMessage 驗證，
// 兩端與伺服器共用本模組，型別即文件。

import type { StoryActionId, StoryScreenId } from './story';

export type Role = 'host' | 'controller';

export interface HelloMsg {
  type: 'hello';
  role: Role;
}

/** 控制器指向（四元數 x,y,z,w）+ 送出時間戳（ms） */
export interface OrientMsg {
  type: 'orient';
  q: [number, number, number, number];
  t: number;
}

export interface BtnMsg {
  type: 'btn';
  id: 'action';
  pressed: boolean;
}

export interface ReadyMsg {
  type: 'ready';
}

/** server → host：控制器連線狀態 */
export interface StatusMsg {
  type: 'status';
  controller: boolean;
}

/** server → 舊 controller：已被新控制器取代 */
export interface KickMsg {
  type: 'kick';
}

export type ControllerCueId =
  | 'ambience-start'
  | 'ambience-stop'
  | 'ring'
  | 'whisper'
  | 'impact'
  | 'jumpscare';

/** host 要求手機播放的私人音效／震動 cue。 */
export interface CueMsg {
  type: 'cue';
  id: ControllerCueId;
}

export interface StoryMsg {
  type: 'story';
  screen: StoryScreenId;
}

export interface StoryActionMsg {
  type: 'story-action';
  id: StoryActionId;
  value?: string;
}

export type Msg =
  | HelloMsg
  | OrientMsg
  | BtnMsg
  | ReadyMsg
  | StatusMsg
  | KickMsg
  | CueMsg
  | StoryMsg
  | StoryActionMsg;

const STORY_SCREEN_IDS = new Set<StoryScreenId>([
  'standby',
  'prologue',
  'incoming-407',
  'call-window',
  'find-window',
  'window-opened',
  'find-portrait',
  'portrait-inspect-front',
  'portrait-inspect-back',
  'portrait-changed',
  'find-drawer',
  'keypad-0317',
  'tape-warning-one',
  'tape-warning-two',
  'find-door',
  'door-listen',
  'door-choice',
  'reseal-portrait',
  'reseal-window',
  'reseal-door',
  'ending-open',
  'ending-sealed',
]);

const STORY_ACTION_IDS = new Set<StoryActionId>([
  'answer',
  'continue',
  'digit',
  'clear-code',
  'submit-code',
  'choose-open',
  'choose-seal',
]);

function isQuaternion(q: unknown): q is [number, number, number, number] {
  return (
    Array.isArray(q) &&
    q.length === 4 &&
    q.every((n) => typeof n === 'number' && Number.isFinite(n))
  );
}

/** 解析並驗證訊息；格式不符回傳 null（呼叫端直接忽略即可） */
export function parseMessage(raw: unknown): Msg | null {
  if (typeof raw !== 'string') return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const m = data as Record<string, unknown>;

  switch (m.type) {
    case 'hello':
      return m.role === 'host' || m.role === 'controller'
        ? { type: 'hello', role: m.role }
        : null;
    case 'orient':
      return isQuaternion(m.q) && typeof m.t === 'number' && Number.isFinite(m.t)
        ? { type: 'orient', q: m.q, t: m.t }
        : null;
    case 'btn':
      return m.id === 'action' && typeof m.pressed === 'boolean'
        ? { type: 'btn', id: 'action', pressed: m.pressed }
        : null;
    case 'ready':
      return { type: 'ready' };
    case 'status':
      return typeof m.controller === 'boolean'
        ? { type: 'status', controller: m.controller }
        : null;
    case 'kick':
      return { type: 'kick' };
    case 'cue':
      return m.id === 'ambience-start' ||
        m.id === 'ambience-stop' ||
        m.id === 'ring' ||
        m.id === 'whisper' ||
        m.id === 'impact' ||
        m.id === 'jumpscare'
        ? { type: 'cue', id: m.id }
        : null;
    case 'story':
      return typeof m.screen === 'string' && STORY_SCREEN_IDS.has(m.screen as StoryScreenId)
        ? { type: 'story', screen: m.screen as StoryScreenId }
        : null;
    case 'story-action': {
      if (typeof m.id !== 'string' || !STORY_ACTION_IDS.has(m.id as StoryActionId)) return null;
      if (m.value !== undefined && (typeof m.value !== 'string' || m.value.length > 16)) return null;
      if (m.id === 'digit' && (typeof m.value !== 'string' || !/^[0-9]$/.test(m.value))) return null;
      return m.value === undefined
        ? { type: 'story-action', id: m.id as StoryActionId }
        : { type: 'story-action', id: m.id as StoryActionId, value: m.value };
    }
    default:
      return null;
  }
}
