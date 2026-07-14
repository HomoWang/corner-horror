// WebSocket 訊息協定：所有進出 relay 的訊息都經過 parseMessage 驗證，
// 兩端與伺服器共用本模組，型別即文件。

import type { StoryActionId, StoryScreenId } from './story';
import type { NarrationRole } from './narration';

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

export type FmvHapticId = 'long' | 'double-short';

/** 精確對齊影片時間軸的手機音效、自由台詞與震動。 */
export interface FmvCueMsg {
  type: 'fmv-cue';
  audio?: ControllerCueId;
  narration?: string;
  role?: NarrationRole;
  haptic?: FmvHapticId;
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
  | FmvCueMsg
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

const CONTROLLER_CUE_IDS = new Set<ControllerCueId>([
  'ambience-start',
  'ambience-stop',
  'ring',
  'whisper',
  'impact',
  'jumpscare',
]);

const NARRATION_ROLES = new Set<NarrationRole>([
  'manager',
  'xiaoyu',
  'mother',
  'whisper',
  'entity',
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
      return typeof m.id === 'string' && CONTROLLER_CUE_IDS.has(m.id as ControllerCueId)
        ? { type: 'cue', id: m.id as ControllerCueId }
        : null;
    case 'fmv-cue': {
      const audio = typeof m.audio === 'string' && CONTROLLER_CUE_IDS.has(m.audio as ControllerCueId)
        ? (m.audio as ControllerCueId)
        : undefined;
      const narration = typeof m.narration === 'string' && m.narration.trim().length > 0 && m.narration.length <= 120
        ? m.narration
        : undefined;
      const role = typeof m.role === 'string' && NARRATION_ROLES.has(m.role as NarrationRole)
        ? (m.role as NarrationRole)
        : undefined;
      const haptic = m.haptic === 'long' || m.haptic === 'double-short' ? m.haptic : undefined;
      if (!audio && !narration && !haptic) return null;
      if (m.audio !== undefined && !audio) return null;
      if (m.narration !== undefined && !narration) return null;
      if (m.role !== undefined && !role) return null;
      if (m.haptic !== undefined && !haptic) return null;
      return {
        type: 'fmv-cue',
        ...(audio ? { audio } : {}),
        ...(narration ? { narration, role: role ?? 'entity' } : {}),
        ...(haptic ? { haptic } : {}),
      };
    }
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
