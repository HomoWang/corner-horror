// Controller 頁（Phase 2）：開始 → 感測權限 → 陀螺儀指向以 rAF 頻率上傳；
// 歸中鈕、action 鈕、指數退避重連、kick 處理。

import type { Quaternion } from 'three';
import { parseMessage } from '../shared/protocol';
import { buildWebSocketUrl, normalizeRoomCode } from '../shared/session';
import { OrientationStream, requestOrientationPermission } from './sensors';
import { ControllerAudioEngine } from './audio';
import { NarrationEngine } from './narration';

const statusEl = document.querySelector<HTMLParagraphElement>('#status')!;
const audioDiagEl = document.querySelector<HTMLParagraphElement>('#audio-diag')!;
const startBtn = document.querySelector<HTMLButtonElement>('#start')!;
const controlsEl = document.querySelector<HTMLDivElement>('#controls')!;
const actionBtn = document.querySelector<HTMLButtonElement>('#action')!;
const recenterBtn = document.querySelector<HTMLButtonElement>('#recenter')!;

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 5000;
const NO_SENSOR_TIMEOUT_MS = 2000;
const roomCode = normalizeRoomCode(new URLSearchParams(location.search).get('room'));
const raidMode = new URLSearchParams(location.search).get('mode') === 'raid';

if (raidMode) {
  document.body.classList.add('raid-controller');
  actionBtn.textContent = '射擊';
  actionBtn.setAttribute('aria-label', '射擊');
  startBtn.textContent = '出擊';
  document.querySelector<HTMLElement>('#screen-cue')!.textContent = '手機對準畫面・按住射擊・發光核心傷害加倍';
}

const stream = new OrientationStream();
// 手機端音訊診斷：顯示最近三筆人聲事件（received / decoded / playing），實機除錯用。
const audioDiagLines: string[] = [];
function pushAudioDiag(line: string): void {
  const time = new Date();
  const stamp = `${String(time.getMinutes()).padStart(2, '0')}:${String(time.getSeconds()).padStart(2, '0')}`;
  audioDiagLines.push(`${stamp} ${line}`);
  if (audioDiagLines.length > 3) audioDiagLines.shift();
  audioDiagEl.textContent = audioDiagLines.join('\n');
}
const audio = new ControllerAudioEngine(pushAudioDiag);
const narration = new NarrationEngine((active) => audio.setVoiceDucking(active));
let ws: WebSocket | null = null;
let kicked = false;
let reconnectDelay = RECONNECT_BASE_MS;
let starting = false;

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function connect(): void {
  if (!roomCode) return;
  let endpoint: string;
  try {
    endpoint = buildWebSocketUrl(roomCode, import.meta.env.VITE_WS_URL, location.href);
  } catch {
    setStatus('WebSocket 後端網址設定錯誤');
    return;
  }
  ws = new WebSocket(endpoint);

  ws.addEventListener('open', () => {
    reconnectDelay = RECONNECT_BASE_MS;
    ws?.send(JSON.stringify({ type: 'hello', role: 'controller' }));
    setStatus('已連線');
  });

  ws.addEventListener('message', (ev) => {
    const msg = parseMessage(ev.data);
    if (msg?.type === 'kick') {
      kicked = true;
      narration.stop();
      setStatus('已被其他控制器取代（重新整理可搶回）');
      ws?.close();
    }
    if (msg?.type === 'cue') {
      if (msg.id === 'jumpscare') narration.stop();
      audio.play(msg.id);
    }
    if (msg?.type === 'story') {
      document.body.dataset.story = msg.screen;
      narration.play(msg.screen);
      // 來電畫面本身也觸發鈴聲；即使獨立 cue 在網路切換時遺失，電話仍一定會響。
      if (msg.screen === 'incoming-407') audio.play('ring');
    }
    if (msg?.type === 'fmv-cue') {
      if (msg.audio) audio.play(msg.audio);
      if (msg.narration && msg.role) narration.playText(msg.narration, msg.role);
      if (msg.haptic === 'long') navigator.vibrate?.(620);
      if (msg.haptic === 'double-short') navigator.vibrate?.([120, 90, 120]);
    }
  });

  ws.addEventListener('close', () => {
    ws = null;
    narration.stop();
    if (kicked) return;
    setStatus(`連線中斷，${(reconnectDelay / 1000).toFixed(1)} 秒後重連…`);
    setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  });
}

function send(payload: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function onQuat(q: Quaternion): void {
  send({ type: 'orient', q: [q.x, q.y, q.z, q.w], t: Date.now() });
}

async function start(): Promise<void> {
  if (starting || document.body.classList.contains('started')) return;
  starting = true;
  // 兩個 API 都必須直接在 click 的使用者手勢內被呼叫。
  void audio.unlock();
  const narrationReady = narration.unlock();
  const permissionRequest = requestOrientationPermission();
  // 音效解鎖在部分 WebView 可能長時間停在 suspended；不能讓它卡住故事 UI。
  const permission = await permissionRequest;
  document.body.classList.add('started');
  starting = false;
  controlsEl.classList.add('active');
  send({ type: 'ready' });
  if (permission === 'granted') stream.start(onQuat);

  // 螢幕保持喚醒：實測時手機熄屏會停掉感測器（不支援就算了）
  try {
    await (
      navigator as Navigator & {
        wakeLock?: { request(type: 'screen'): Promise<unknown> };
      }
    ).wakeLock?.request('screen');
  } catch {
    /* 不支援或被拒都不影響功能 */
  }

  if (!narrationReady) {
    setStatus('此瀏覽器沒有角色語音；請改用手機 Safari 或 Chrome');
  } else if (permission === 'unsupported' || permission === 'denied') {
    setStatus('此裝置沒有方向感測；請用主畫面滑鼠控制光錐');
  } else {
    setTimeout(() => {
      if (!stream.hasData) {
        setStatus('偵測不到感測資料——請確認用手機開啟本頁（桌機無陀螺儀）');
      }
    }, NO_SENSOR_TIMEOUT_MS);
  }
}

startBtn.addEventListener('click', () => void start());
recenterBtn.addEventListener('click', () => stream.recenter());
actionBtn.addEventListener('pointerdown', () => {
  // 每次真實觸碰都再嘗試恢復手機音效，避免行動瀏覽器把背景 AudioContext 暫停。
  void audio.unlock();
  narration.unlock();
  actionBtn.classList.add('pressed');
  send({ type: 'btn', id: 'action', pressed: true });
});
actionBtn.addEventListener('pointerup', () => {
  actionBtn.classList.remove('pressed');
  send({ type: 'btn', id: 'action', pressed: false });
});
const releaseAction = () => {
  actionBtn.classList.remove('pressed');
  send({ type: 'btn', id: 'action', pressed: false });
};

actionBtn.addEventListener('pointercancel', releaseAction);
actionBtn.addEventListener('pointerleave', releaseAction);

if (roomCode) {
  connect();
} else {
  startBtn.disabled = true;
  setStatus('連線網址缺少房間碼，請重新掃描主畫面的 QR Code');
}
