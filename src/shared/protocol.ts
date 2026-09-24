// The host, phone controller, and relay share this validated message contract.

export type Role = 'host' | 'controller';

export interface HelloMsg {
  type: 'hello';
  role: Role;
}

export interface ReadyMsg {
  type: 'ready';
}

export interface StatusMsg {
  type: 'status';
  controller: boolean;
}

export interface KickMsg {
  type: 'kick';
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

export interface ProtoShakeMsg {
  type: 'proto-shake';
  intensity: number;
  t: number;
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

export interface ProtoPauseMsg {
  type: 'proto-pause';
}

export type ProtoItemId =
  | 'receipt'
  | 'smallKey'
  | 'oldBattery'
  | 'tape'
  | 'pendant'
  | 'photo'
  | 'antenna'
  | 'boxCutter'
  | 'firefighterGear'
  | 'firefighterMask'
  | 'completeFirefighterGear';
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
  paused?: boolean;
  equipmentPrompt?: boolean;
}

export interface ProtoVibrateMsg {
  type: 'proto-vibrate';
  pattern: number | number[];
}

export type Msg =
  | HelloMsg
  | ReadyMsg
  | StatusMsg
  | KickMsg
  | ProtoPointerMsg
  | ProtoMoveMsg
  | ProtoShakeMsg
  | ProtoNavigateMsg
  | ProtoInteractMsg
  | ProtoUseMsg
  | ProtoInventoryMsg
  | ProtoPauseMsg
  | ProtoItemActionMsg
  | ProtoControllerStateMsg
  | ProtoVibrateMsg;

const PROTO_ITEM_IDS = new Set<ProtoItemId>([
  'receipt',
  'smallKey',
  'oldBattery',
  'tape',
  'pendant',
  'photo',
  'antenna',
  'boxCutter',
  'firefighterGear',
  'firefighterMask',
  'completeFirefighterGear',
]);
const PROTO_ITEM_ACTIONS = new Set<ProtoItemAction>(['use', 'inspect']);

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

export function parseMessage(raw: unknown): Msg | null {
  if (typeof raw !== 'string') return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof data !== 'object' || data === null) return null;
  const message = data as Record<string, unknown>;

  switch (message.type) {
    case 'hello':
      return message.role === 'host' || message.role === 'controller'
        ? { type: 'hello', role: message.role }
        : null;
    case 'ready':
      return { type: 'ready' };
    case 'status':
      return typeof message.controller === 'boolean'
        ? { type: 'status', controller: message.controller }
        : null;
    case 'kick':
      return { type: 'kick' };
    case 'proto-pointer':
      return finiteNumber(message.x) && finiteNumber(message.y) && finiteNumber(message.t)
        ? {
            type: 'proto-pointer',
            x: clampUnit(message.x),
            y: clampUnit(message.y),
            t: message.t,
          }
        : null;
    case 'proto-move':
      return finiteNumber(message.x) && finiteNumber(message.y)
        ? { type: 'proto-move', x: clampUnit(message.x), y: clampUnit(message.y) }
        : null;
    case 'proto-shake':
      return finiteNumber(message.intensity) && finiteNumber(message.t)
        ? {
            type: 'proto-shake',
            intensity: Math.max(0, Math.min(1, message.intensity)),
            t: message.t,
          }
        : null;
    case 'proto-navigate':
      return message.direction === 'left' ||
        message.direction === 'right' ||
        message.direction === 'forward' ||
        message.direction === 'back'
        ? { type: 'proto-navigate', direction: message.direction }
        : null;
    case 'proto-interact':
      return { type: 'proto-interact' };
    case 'proto-use':
      return typeof message.pressed === 'boolean'
        ? { type: 'proto-use', pressed: message.pressed }
        : null;
    case 'proto-inventory':
      return { type: 'proto-inventory' };
    case 'proto-pause':
      return { type: 'proto-pause' };
    case 'proto-item-action':
      return typeof message.item === 'string' &&
        PROTO_ITEM_IDS.has(message.item as ProtoItemId) &&
        typeof message.action === 'string' &&
        PROTO_ITEM_ACTIONS.has(message.action as ProtoItemAction)
        ? {
            type: 'proto-item-action',
            item: message.item as ProtoItemId,
            action: message.action as ProtoItemAction,
          }
        : null;
    case 'proto-controller-state':
      return typeof message.inventoryOpen === 'boolean' &&
        (message.paused === undefined || typeof message.paused === 'boolean') &&
        (message.equipmentPrompt === undefined || typeof message.equipmentPrompt === 'boolean') &&
        Array.isArray(message.slots) &&
        message.slots.length === 12 &&
        message.slots.every(
          (item): item is ProtoItemId | null =>
            item === null ||
            (typeof item === 'string' && PROTO_ITEM_IDS.has(item as ProtoItemId)),
        ) &&
        (message.selectedItem === undefined ||
          (typeof message.selectedItem === 'string' &&
            PROTO_ITEM_IDS.has(message.selectedItem as ProtoItemId))) &&
        (message.detailItem === undefined ||
          (typeof message.detailItem === 'string' &&
            PROTO_ITEM_IDS.has(message.detailItem as ProtoItemId)))
        ? {
            type: 'proto-controller-state',
            inventoryOpen: message.inventoryOpen,
            ...(typeof message.paused === 'boolean' ? { paused: message.paused } : {}),
            ...(typeof message.equipmentPrompt === 'boolean'
              ? { equipmentPrompt: message.equipmentPrompt }
              : {}),
            slots: message.slots,
            ...(typeof message.selectedItem === 'string'
              ? { selectedItem: message.selectedItem as ProtoItemId }
              : {}),
            ...(typeof message.detailItem === 'string'
              ? { detailItem: message.detailItem as ProtoItemId }
              : {}),
          }
        : null;
    case 'proto-vibrate':
      return isVibrationPattern(message.pattern)
        ? { type: 'proto-vibrate', pattern: message.pattern }
        : null;
    default:
      return null;
  }
}
