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
  | 'voice-warning'
  | 'voice-door'
  | 'voice-wrong-side'
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

export interface ProtoPointerMsg {
  type: 'proto-pointer';
  x: number;
  y: number;
  t: number;
}

export interface ProtoMoveMsg {
  type: 'proto-move';
  x: number;
  y: number;
}

export interface ProtoNavigateMsg {
  type: 'proto-navigate';
  direction: 'left' | 'right' | 'forward' | 'back';
}

export interface ProtoInteractMsg {
  type: 'proto-interact';
}

export interface ProtoUseMsg {
  type: 'proto-use';
  pressed: boolean;
}

export interface ProtoInventoryMsg {
  type: 'proto-inventory';
}

export type ProtoItemId =
  | 'receipt'
  | 'pencil'
  | 'tape'
  | 'oldBattery'
  | 'smallKey'
  | 'pendant'
  | 'photo';
export type ProtoItemAction = 'use' | 'inspect';

export interface ProtoItemActionMsg {
  type: 'proto-item-action';
  item: ProtoItemId;
  action: ProtoItemAction;
}

export interface ProtoControllerStateMsg {
  type: 'proto-controller-state';
  slots: Array<ProtoItemId | null>;
  selectedItem?: ProtoItemId;
  detailItem?: ProtoItemId;
  inventoryOpen: boolean;
}

export interface ProtoVibrateMsg {
  type: 'proto-vibrate';
  pattern: number | number[];
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
  | StoryActionMsg
  | ProtoPointerMsg
  | ProtoMoveMsg
  | ProtoNavigateMsg
  | ProtoInteractMsg
  | ProtoUseMsg
  | ProtoInventoryMsg
  | ProtoItemActionMsg
  | ProtoControllerStateMsg
  | ProtoVibrateMsg;

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
  'voice-warning',
  'voice-door',
  'voice-wrong-side',
  'jumpscare',
]);

const PROTO_ITEM_IDS = new Set<ProtoItemId>([
  'receipt',
  'pencil',
  'tape',
  'oldBattery',
  'smallKey',
  'pendant',
  'photo',
]);
const PROTO_ITEM_ACTIONS = new Set<ProtoItemAction>(['use', 'inspect']);

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

function finiteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function clampUnit(value: number): number {
  return Math.max(-1, Math.min(1, value));
}

function isVibrationPattern(value: unknown): value is number | number[] {
  if (finiteNumber(value)) return value >= 0 && value <= 2000;
  return (
    Array.isArray(value) &&
    value.length <= 16 &&
    value.every((part) => finiteNumber(part) && part >= 0 && part <= 2000)
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
    case 'proto-pointer':
      return finiteNumber(m.x) && finiteNumber(m.y) && finiteNumber(m.t)
        ? { type: 'proto-pointer', x: clampUnit(m.x), y: clampUnit(m.y), t: m.t }
        : null;
    case 'proto-move':
      return finiteNumber(m.x) && finiteNumber(m.y)
        ? { type: 'proto-move', x: clampUnit(m.x), y: clampUnit(m.y) }
        : null;
    case 'proto-navigate':
      return m.direction === 'left' ||
        m.direction === 'right' ||
        m.direction === 'forward' ||
        m.direction === 'back'
        ? { type: 'proto-navigate', direction: m.direction }
        : null;
    case 'proto-interact':
      return { type: 'proto-interact' };
    case 'proto-use':
      return typeof m.pressed === 'boolean' ? { type: 'proto-use', pressed: m.pressed } : null;
    case 'proto-inventory':
      return { type: 'proto-inventory' };
    case 'proto-item-action':
      return typeof m.item === 'string' &&
        PROTO_ITEM_IDS.has(m.item as ProtoItemId) &&
        typeof m.action === 'string' &&
        PROTO_ITEM_ACTIONS.has(m.action as ProtoItemAction)
        ? {
            type: 'proto-item-action',
            item: m.item as ProtoItemId,
            action: m.action as ProtoItemAction,
          }
        : null;
    case 'proto-controller-state':
      return typeof m.inventoryOpen === 'boolean' &&
        Array.isArray(m.slots) &&
        m.slots.length === 6 &&
        m.slots.every(
          (item): item is ProtoItemId | null =>
            item === null ||
            (typeof item === 'string' && PROTO_ITEM_IDS.has(item as ProtoItemId)),
        ) &&
        (m.selectedItem === undefined ||
          (typeof m.selectedItem === 'string' &&
            PROTO_ITEM_IDS.has(m.selectedItem as ProtoItemId))) &&
        (m.detailItem === undefined ||
          (typeof m.detailItem === 'string' && PROTO_ITEM_IDS.has(m.detailItem as ProtoItemId)))
        ? {
            type: 'proto-controller-state',
            inventoryOpen: m.inventoryOpen,
            slots: m.slots,
            ...(typeof m.selectedItem === 'string'
              ? { selectedItem: m.selectedItem as ProtoItemId }
              : {}),
            ...(typeof m.detailItem === 'string'
              ? { detailItem: m.detailItem as ProtoItemId }
              : {}),
          }
        : null;
    case 'proto-vibrate':
      return isVibrationPattern(m.pattern) ? { type: 'proto-vibrate', pattern: m.pattern } : null;
    default:
      return null;
  }
}
