// WebSocket 訊息協定：所有進出 relay 的訊息都經過 parseMessage 驗證，
// 兩端與伺服器共用本模組，型別即文件。

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

export type Msg = HelloMsg | OrientMsg | BtnMsg | StatusMsg | KickMsg | CueMsg;

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
    default:
      return null;
  }
}
