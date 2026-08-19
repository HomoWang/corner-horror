import QRCode from 'qrcode';
import {
  parseMessage,
  type ProtoItemAction,
  type ProtoItemId,
} from '../shared/protocol';
import { publicUrl } from '../shared/public-url';
import { buildWebSocketUrl, createRoomCode, normalizeRoomCode } from '../shared/session';
import { PrototypeRoom2D, type RoomObjectId } from './room2d';

type ItemId = ProtoItemId;

const itemLabels: Record<ItemId, string> = {
  receipt: '便利商店收據',
  pencil: '短鉛筆',
  tape: '錄音磁帶',
  oldBattery: '舊電池',
  smallKey: '鑰匙',
  pendant: '錄音吊飾',
  photo: '男女主角的合照',
};

const itemDetails: Record<ItemId, { image: string; description: string }> = {
  receipt: {
    image: publicUrl('assets/inventory-icons/receipt.png'),
    description: '背面留著模糊的壓痕。',
  },
  pencil: {
    image: publicUrl('assets/room407/props/pencil-model.png'),
    description: '削得很短，筆芯還能留下痕跡。',
  },
  tape: {
    image: publicUrl('assets/inventory-icons/tape.png'),
    description: '外殼被煙燻黑，標籤上的字已經看不清楚。',
  },
  oldBattery: {
    image: publicUrl('assets/inventory-icons/battery.png'),
    description: '電量所剩不多，仍能讓老舊電器運作一會。',
  },
  smallKey: {
    image: publicUrl('assets/inventory-icons/key-user.png'),
    description: '一把鑰匙，不像是用來開房門的。',
  },
  pendant: {
    image: publicUrl('assets/inventory-icons/pendant-user.png'),
    description: '按鍵已經磨損的錄音吊飾，裡面留著一段聲音。',
  },
  photo: {
    image: publicUrl('assets/room407/photos/男女主角照片.png'),
    description: '照片背面寫著：聽見那些聲音……按一下……吊飾……',
  },
};

const qrCanvas = document.querySelector<HTMLCanvasElement>('#qr')!;
const joinUrlEl = document.querySelector<HTMLParagraphElement>('#join-url')!;
const overlayEl = document.querySelector<HTMLElement>('#overlay')!;
const statusEl = document.querySelector<HTMLElement>('#status')!;
const targetEl = document.querySelector<HTMLElement>('#target')!;
const heldItemEl = document.querySelector<HTMLElement>('#held-item')!;
const noticeEl = document.querySelector<HTMLElement>('#notice')!;
const audioEnableBtn = document.querySelector<HTMLButtonElement>('#audio-enable')!;
const inventoryEl = document.querySelector<HTMLElement>('#inventory')!;
const receiptPanelEl = document.querySelector<HTMLElement>('#receipt-panel')!;
const pencilPanelEl = document.querySelector<HTMLElement>('#pencil-panel')!;
const genericItemPanelEl = document.querySelector<HTMLElement>('#generic-item-panel')!;
const genericItemPreviewImage =
  document.querySelector<HTMLImageElement>('#generic-item-image')!;
const genericItemNameEl = document.querySelector<HTMLElement>('#generic-item-name')!;
const genericItemDescriptionEl =
  document.querySelector<HTMLElement>('#generic-item-description')!;
const receiptCodeEl = document.querySelector<HTMLElement>('#receipt-code')!;
const safeInspectEl = document.querySelector<HTMLElement>('#safe-inspect')!;
const safeInspectImageEl = document.querySelector<HTMLImageElement>('#safe-inspect-image')!;
const safeKeyHotspotEl = document.querySelector<HTMLElement>('#safe-key-hotspot')!;
const safePendantHotspotEl = document.querySelector<HTMLElement>('#safe-pendant-hotspot')!;
const safePhotoHotspotEl = document.querySelector<HTMLElement>('#safe-photo-hotspot')!;
const photoInspectEl = document.querySelector<HTMLElement>('#photo-inspect')!;
const photoCardEl = document.querySelector<HTMLButtonElement>('#photo-card')!;
const drawerPuzzleEl = document.querySelector<HTMLElement>('#drawer-puzzle')!;
const drawerCodeDisplayEl = document.querySelector<HTMLOutputElement>('#drawer-code-display')!;
const quickSlotEl = document.querySelector<HTMLElement>('#quick-slot')!;
const quickSlotLabelEl = document.querySelector<HTMLElement>('#quick-slot-label')!;
const roomScene = document.querySelector<HTMLElement>('#room-scene')!;
const room3d = new PrototypeRoom2D(roomScene);

const roomCode =
  normalizeRoomCode(new URLSearchParams(location.search).get('room')) ??
  normalizeRoomCode(sessionStorage.getItem('corner-horror-prototype-room')) ??
  createRoomCode();
sessionStorage.setItem('corner-horror-prototype-room', roomCode);

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectEnabled = true;
let pointer = { x: 0, y: 0 };
let move = { x: 0, y: 0 };
let target: HTMLElement | null = null;
let roomTarget: RoomObjectId | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let inventoryOpen = false;
let safeInspectOpen = false;
let photoInspectOpen = false;
let photoFlipped = false;
let drawerPuzzleOpen = false;
let drawerUnlocked = false;
let safeUnlocked = false;
let drawerCode = '';
let receiptInspectOpen = false;
let receiptRubEnabled = false;
let selectedItem: ItemId | null = null;
let detailItem: ItemId | null = null;
let lastRubPointer: { x: number; y: number } | null = null;
let lastRubFeedback = 0;
let receiptRubProgress = 0;
let receiptSolved = false;
let interactionHeld = false;
let hostAudioContext: AudioContext | null = null;
let hostAudioMuted = false;
const ambienceAudio = document.querySelector<HTMLAudioElement>('#ambient-audio')!;
ambienceAudio.volume = 0.26;
ambienceAudio.loop = true;
type HostSoundId =
  | 'keypad'
  | 'keypadUnlock'
  | 'keypadError'
  | 'keypadReset'
  | 'pencil'
  | 'footsteps';
const hostSoundUrls: Record<HostSoundId, string> = {
  keypad: publicUrl('assets/audio/password-keypad.mp3'),
  keypadUnlock: publicUrl('assets/audio/password-unlock.mp3'),
  keypadError: publicUrl('assets/audio/password-error.mp3'),
  keypadReset: publicUrl('assets/audio/password-reset.mp3'),
  pencil: publicUrl('assets/audio/pencil-rubbing.mp3'),
  footsteps: publicUrl('assets/audio/player-walking.mp3'),
};
const hostAudioBuffers = new Map<HostSoundId, AudioBuffer>();
let hostAudioLoadPromise: Promise<void> | null = null;
let footstepSource: AudioBufferSourceNode | null = null;
let footstepGain: GainNode | null = null;
let footstepStopTimer: ReturnType<typeof setTimeout> | null = null;
let pencilSource: AudioBufferSourceNode | null = null;
let pencilGain: GainNode | null = null;
let pencilStopTimer: ReturnType<typeof setTimeout> | null = null;
const inventorySlots: Array<ItemId | null> = Array.from({ length: 6 }, () => null);
const collectedItems = new Set<ItemId>();
const SAFE_INSPECT_IMAGES = {
  closed: publicUrl('assets/room407/photos/密碼鎖.png'),
  all: publicUrl('assets/room407/photos/safe-open-user-all.png'),
  noKey: publicUrl('assets/room407/photos/safe-open-user-no-key.png'),
  noPendant: publicUrl('assets/room407/photos/safe-open-user-no-pendant.png'),
  photoOnly: publicUrl('assets/room407/photos/safe-open-user-photo-only.png'),
  empty: publicUrl('assets/room407/photos/safe-open-user-empty.png'),
} as const;
Object.values(SAFE_INSPECT_IMAGES).forEach((src) => {
  const preload = new Image();
  preload.src = src;
});

function send(payload: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function showNotice(text: string): void {
  noticeEl.textContent = text;
  noticeEl.classList.add('show');
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => noticeEl.classList.remove('show'), 2400);
}

function vibrate(pattern: number | number[]): void {
  send({ type: 'proto-vibrate', pattern });
}

function ensureHostAudioContext(): AudioContext | null {
  const AudioContextConstructor =
    window.AudioContext ??
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextConstructor) return null;
  hostAudioContext ??= new AudioContextConstructor();
  return hostAudioContext;
}

async function loadHostAudioAssets(context: AudioContext): Promise<void> {
  if (hostAudioBuffers.size === Object.keys(hostSoundUrls).length) return;
  if (hostAudioLoadPromise) return hostAudioLoadPromise;

  hostAudioLoadPromise = Promise.all(
    Object.entries(hostSoundUrls).map(async ([id, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Unable to load host sound: ${url}`);
      const audioBuffer = await context.decodeAudioData(await response.arrayBuffer());
      hostAudioBuffers.set(id as HostSoundId, audioBuffer);
    }),
  )
    .then(() => undefined)
    .catch((error: unknown) => {
      hostAudioLoadPromise = null;
      throw error;
    });
  return hostAudioLoadPromise;
}

function unlockHostAudio(): void {
  if (hostAudioMuted) return;
  void startAmbientAudio();
  const context = ensureHostAudioContext();
  if (!context) return;
  if (context.state === 'suspended') {
    void context.resume().then(() => {
      updateHostAudioButton();
      void loadHostAudioAssets(context).then(updateHostAudioButton).catch(() => updateHostAudioButton());
    });
    return;
  }
  updateHostAudioButton();
  void loadHostAudioAssets(context).then(updateHostAudioButton).catch(() => updateHostAudioButton());
}

async function startAmbientAudio(): Promise<boolean> {
  if (hostAudioMuted) return false;
  ambienceAudio.muted = false;
  try {
    await ambienceAudio.play();
    updateHostAudioButton();
    return true;
  } catch {
    // Muted playback is allowed by more browsers. Unmute immediately when the
    // site already has autoplay permission; otherwise the first local gesture
    // handled by unlockHostAudio completes the same transition.
    try {
      ambienceAudio.muted = true;
      await ambienceAudio.play();
      if (!hostAudioMuted) ambienceAudio.muted = false;
      const playing = !ambienceAudio.paused && !ambienceAudio.muted;
      updateHostAudioButton();
      return playing;
    } catch {
      ambienceAudio.muted = false;
      updateHostAudioButton();
      return false;
    }
  }
}

function playLoadedHostSound(
  context: AudioContext,
  id: HostSoundId,
  options: { volume?: number; playbackRate?: number; delay?: number } = {},
): AudioBufferSourceNode | null {
  const buffer = hostAudioBuffers.get(id);
  if (!buffer || context.state !== 'running') return null;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.playbackRate.value = options.playbackRate ?? 1;
  gain.gain.value = options.volume ?? 1;
  source.connect(gain).connect(context.destination);
  source.start(context.currentTime + (options.delay ?? 0));
  return source;
}

async function playHostSound(
  id: HostSoundId,
  options: { volume?: number; playbackRate?: number; delay?: number } = {},
): Promise<void> {
  if (hostAudioMuted) return;
  const context = ensureHostAudioContext();
  if (!context) return;
  if (context.state === 'suspended') await context.resume().catch(() => undefined);
  if (context.state !== 'running') return;
  await loadHostAudioAssets(context).catch(() => undefined);
  playLoadedHostSound(context, id, options);
  updateHostAudioButton();
}

function startFootsteps(): void {
  if (footstepStopTimer) {
    clearTimeout(footstepStopTimer);
    footstepStopTimer = null;
  }
  if (hostAudioMuted || footstepSource) return;
  const context = ensureHostAudioContext();
  const buffer = hostAudioBuffers.get('footsteps');
  if (!context || context.state !== 'running' || !buffer) return;

  const now = context.currentTime;
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  if (buffer.duration > 0.3) {
    source.loopStart = 0.08;
    source.loopEnd = buffer.duration - 0.08;
  }
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.72, now + 0.14);
  source.connect(gain).connect(context.destination);
  source.start(now);
  footstepSource = source;
  footstepGain = gain;
  source.addEventListener('ended', () => {
    if (footstepSource !== source) return;
    footstepSource = null;
    footstepGain = null;
  });
}

function stopFootsteps(): void {
  if (footstepStopTimer) {
    clearTimeout(footstepStopTimer);
    footstepStopTimer = null;
  }
  const context = hostAudioContext;
  const source = footstepSource;
  const gain = footstepGain;
  if (!context || !source || !gain) return;

  footstepSource = null;
  footstepGain = null;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.32);
  source.stop(now + 0.35);
}

function scheduleFootstepStop(): void {
  if (!footstepSource || footstepStopTimer) return;
  footstepStopTimer = setTimeout(stopFootsteps, 520);
}

function updateFootsteps(movedDistance: number): void {
  const walking = movedDistance > 0.00025;
  if (walking) startFootsteps();
  else scheduleFootstepStop();
}

function startPencilSound(): void {
  if (hostAudioMuted) return;
  if (pencilStopTimer) {
    clearTimeout(pencilStopTimer);
    pencilStopTimer = null;
  }

  if (!pencilSource) {
    const context = ensureHostAudioContext();
    const buffer = hostAudioBuffers.get('pencil');
    if (!context || context.state !== 'running' || !buffer) return;

    const now = context.currentTime;
    const source = context.createBufferSource();
    const gain = context.createGain();
    source.buffer = buffer;
    source.loop = true;
    if (buffer.duration > 0.5) {
      source.loopStart = 0.12;
      source.loopEnd = buffer.duration - 0.12;
    }
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.58, now + 0.035);
    source.connect(gain).connect(context.destination);
    source.start(now);
    pencilSource = source;
    pencilGain = gain;
    source.addEventListener('ended', () => {
      if (pencilSource !== source) return;
      pencilSource = null;
      pencilGain = null;
    });
  }

  pencilStopTimer = setTimeout(stopPencilSound, 280);
}

function stopPencilSound(): void {
  if (pencilStopTimer) {
    clearTimeout(pencilStopTimer);
    pencilStopTimer = null;
  }

  const context = hostAudioContext;
  const source = pencilSource;
  const gain = pencilGain;
  if (!context || !source || !gain) return;

  pencilSource = null;
  pencilGain = null;
  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  source.stop(now + 0.17);
}

function updateHostAudioButton(): void {
  const ready =
    !ambienceAudio.paused ||
    (hostAudioContext?.state === 'running' &&
      hostAudioBuffers.size === Object.keys(hostSoundUrls).length);
  audioEnableBtn.textContent = hostAudioMuted ? '恢復音效' : '靜音';
  audioEnableBtn.classList.toggle('ready', !hostAudioMuted && ready);
  audioEnableBtn.classList.toggle('muted', hostAudioMuted);
  audioEnableBtn.setAttribute('aria-pressed', String(hostAudioMuted));
  audioEnableBtn.title = hostAudioMuted ? '點擊恢復電腦音效' : '點擊靜音';
}

async function toggleHostAudio(): Promise<void> {
  if (!hostAudioMuted) {
    hostAudioMuted = true;
    ambienceAudio.pause();
    ambienceAudio.muted = true;
    stopFootsteps();
    stopPencilSound();
    if (hostAudioContext?.state === 'running') {
      await hostAudioContext.suspend().catch(() => undefined);
    }
    updateHostAudioButton();
    showNotice('電腦音效已靜音。');
    return;
  }

  hostAudioMuted = false;
  ambienceAudio.muted = false;
  const context = ensureHostAudioContext();
  if (!context) {
    showNotice('電腦瀏覽器不支援音效播放。');
    hostAudioMuted = true;
    updateHostAudioButton();
    return;
  }
  if (context.state === 'suspended') await context.resume().catch(() => undefined);
  if (context.state !== 'running') {
    hostAudioMuted = true;
    updateHostAudioButton();
    showNotice('電腦音效尚未取得播放權限。');
    return;
  }
  await loadHostAudioAssets(context).catch(() => undefined);
  await startAmbientAudio();
  updateHostAudioButton();
  if (hostAudioBuffers.size !== Object.keys(hostSoundUrls).length) {
    showNotice('電腦音效載入失敗，請重新整理後再試。');
    return;
  }
  showNotice('電腦音效已恢復。');
}

async function playPuzzleErrorSound(): Promise<void> {
  await playHostSound('keypadError', { volume: 0.78 });
}

function playKeypadSound(): void {
  void playHostSound('keypad', { volume: 0.5 });
}

function playKeypadResetSound(): void {
  void playHostSound('keypadReset', { volume: 0.62 });
}

function playKeypadUnlockSound(): void {
  void playHostSound('keypadUnlock', { volume: 0.78 });
}

function vibratePuzzleError(): void {
  vibrate([220, 130, 220]);
  void playPuzzleErrorSound();
}

function isInterfaceOpen(): boolean {
  return inventoryOpen || safeInspectOpen || photoInspectOpen || drawerPuzzleOpen;
}

function syncControllerState(): void {
  send({
    type: 'proto-controller-state',
    inventoryOpen: inventoryOpen || safeInspectOpen || photoInspectOpen || drawerPuzzleOpen,
    slots: [...inventorySlots],
    ...(selectedItem ? { selectedItem } : {}),
    ...(detailItem ? { detailItem } : {}),
  });
  heldItemEl.textContent = `目前道具：${selectedItem ? itemLabels[selectedItem] : '無'}`;
  quickSlotEl.classList.toggle('active', selectedItem !== null);
  quickSlotLabelEl.textContent = selectedItem ? itemLabels[selectedItem] : '無';
}

async function showQr(): Promise<void> {
  let url = new URL('controller-prototype.html', location.href);
  const configuredControllerBase = import.meta.env.VITE_CONTROLLER_URL?.trim();
  const publicOrigin = new URLSearchParams(location.search).get('public');
  const isLocalHost = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (configuredControllerBase) {
    try {
      const base = configuredControllerBase.endsWith('/')
        ? configuredControllerBase
        : `${configuredControllerBase}/`;
      url = new URL('controller-prototype.html', base);
    } catch {
      // Keep the normal controller URL when the desktop controller URL is invalid.
    }
  } else if (publicOrigin) {
    try {
      const publicBaseUrl = new URL(publicOrigin.endsWith('/') ? publicOrigin : `${publicOrigin}/`);
      if (publicBaseUrl.protocol === 'https:' || publicBaseUrl.protocol === 'http:') {
        url = new URL('controller-prototype.html', publicBaseUrl);
      }
    } catch {
      // Keep the normal controller URL when the optional tunnel URL is invalid.
    }
  } else if (import.meta.env.DEV && isLocalHost) {
    const response = await fetch('/api/net');
    const { ip, port } = (await response.json()) as { ip: string | null; port: number };
    url = new URL(`${location.protocol}//${ip ?? location.hostname}:${port}/controller-prototype.html`);
  }
  url.searchParams.set('room', roomCode);
  url.searchParams.set('v', 'smooth-control-16');
  await QRCode.toCanvas(qrCanvas, url.toString(), { width: 240, margin: 1 });
  joinUrlEl.textContent = url.toString();
}

function connect(): void {
  if (!reconnectEnabled) return;
  if (ws?.readyState === WebSocket.OPEN || ws?.readyState === WebSocket.CONNECTING) return;
  let endpoint: string;
  try {
    endpoint = buildWebSocketUrl(roomCode, import.meta.env.VITE_WS_URL, location.href);
  } catch {
    setStatus('WebSocket URL 建立失敗。');
    return;
  }
  const socket = new WebSocket(endpoint);
  ws = socket;

  socket.addEventListener('open', () => {
    socket.send(JSON.stringify({ type: 'hello', role: 'host' }));
    setStatus('等待手機控制器。');
  });

  socket.addEventListener('message', (event) => {
    const msg = parseMessage(event.data);
    if (!msg) return;
    if (msg.type === 'kick') {
      reconnectEnabled = false;
      setStatus('另一個電腦遊戲視窗已接管連線。');
      socket.close();
      return;
    }
    if (msg.type === 'status') {
      if (!msg.controller) {
        interactionHeld = false;
        stopPencilSound();
      }
      if (msg.controller) {
        overlayEl.classList.add('hidden');
        setStatus('手機已連線。請校正中心。');
      } else {
        overlayEl.classList.remove('hidden');
        setStatus('等待手機控制器。');
      }
    }
    if (msg.type === 'ready') {
      overlayEl.classList.add('hidden');
      setStatus('已同步 407 prototype。');
      syncControllerState();
    }
    if (msg.type === 'proto-pointer') {
      updatePointer(msg.x, msg.y);
    }
    if (msg.type === 'proto-move') {
      move = { x: msg.x, y: msg.y };
    }
    if (msg.type === 'proto-navigate') {
      move = { x: 0, y: 0 };
      room3d.navigate(msg.direction);
    }
    if (msg.type === 'proto-interact') {
      handleInteract();
    }
    if (msg.type === 'proto-use') {
      interactionHeld = msg.pressed;
      if (!interactionHeld) {
        lastRubPointer = null;
        stopPencilSound();
      }
    }
    if (msg.type === 'proto-item-action') {
      handleItemAction(msg.item, msg.action);
    }
  });

  socket.addEventListener('close', () => {
    if (ws === socket) ws = null;
    interactionHeld = false;
    stopPencilSound();
    overlayEl.classList.remove('hidden');
    if (!reconnectEnabled) return;
    setStatus('連線中斷，正在重連。');
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1000);
  });
}

function updatePointer(x: number, y: number): void {
  pointer = { x, y };
  const aimX = `${((x + 1) / 2) * 100}vw`;
  const aimY = `${((1 - y) / 2) * 100}vh`;
  document.documentElement.style.setProperty('--aim-x', aimX);
  document.documentElement.style.setProperty('--aim-y', aimY);
  updateTarget();
  const cursorOnReceipt = target?.dataset.receiptPaper === 'true';
  if (!interactionHeld || !receiptRubEnabled || !receiptInspectOpen || !cursorOnReceipt) {
    lastRubPointer = null;
    stopPencilSound();
    return;
  }

  if (lastRubPointer === null) {
    lastRubPointer = { x, y };
    return;
  }

  const delta = Math.hypot(x - lastRubPointer.x, y - lastRubPointer.y);
  lastRubPointer = { x, y };
  if (delta > 0.01) {
    startPencilSound();
    receiptRubProgress = Math.min(100, receiptRubProgress + delta * 72);
    if (receiptRubProgress - lastRubFeedback >= 8) {
      lastRubFeedback = receiptRubProgress;
      vibrate(18);
    }
    updateReceiptCode();
  }
}

function updateTarget(): void {
  if (!isInterfaceOpen()) {
    target = null;
    roomTarget = room3d.getTargetObject();
    document.querySelectorAll('.active').forEach((element) => element.classList.remove('active'));
    targetEl.textContent = `目前指向：${roomTarget ? roomObjectLabel(roomTarget) : '無'}`;
    return;
  }

  roomTarget = null;
  const clientX = ((pointer.x + 1) / 2) * window.innerWidth;
  const clientY = ((1 - pointer.y) / 2) * window.innerHeight;
  const elements = document.elementsFromPoint(clientX, clientY);
  target = null;
  for (const element of elements) {
    const candidate = element.closest<HTMLElement>(
      '[data-object], [data-inventory-back], [data-receipt-paper], [data-safe-back], [data-safe-keypad], [data-safe-item], [data-photo-back], [data-photo-card], [data-drawer-back], [data-drawer-digit], [data-drawer-clear], [data-drawer-reset], [data-drawer-delete], [data-drawer-submit]',
    );
    if (candidate) {
      target = candidate;
      break;
    }
  }
  document.querySelectorAll('.active').forEach((element) => element.classList.remove('active'));
  target?.classList.add('active');
  targetEl.textContent = `目前指向：${targetLabel(target)}`;
}

function roomObjectLabel(objectId: RoomObjectId): string {
  switch (objectId) {
    case 'wardrobe':
      return '衣櫃';
    case 'wardrobeLeft':
      return '衣櫃左門';
    case 'wardrobeMiddle':
      return '衣櫃中門';
    case 'wardrobeRight':
      return '衣櫃右門';
    case 'receipt':
      return '外套口袋的收據';
    case 'table':
      return '桌子';
    case 'pencil':
      return '短鉛筆';
    case 'safe':
      return safeUnlocked ? '打開的保險箱' : '上鎖的保險箱';
    case 'drawer':
      return drawerUnlocked ? '打開的抽屜' : '有鑰匙孔的抽屜';
    case 'tape':
      return '錄音磁帶';
    case 'oldBattery':
      return '舊電池';
    case 'smallKey':
      return '鑰匙';
    case 'recorder':
      return '錄音機';
    case 'door':
      return '房門';
  }
}

function targetLabel(element: HTMLElement | null): string {
  if (!element) return '無';
  if (element.dataset.inventoryBack) return '返回';
  if (element.dataset.receiptPaper) return '收據背面';
  if (element.dataset.safeBack) return '返回房間';
  if (element.dataset.safeKeypad) return '保險箱密碼面板';
  if (element.dataset.safeItem === 'smallKey') return '鑰匙';
  if (element.dataset.safeItem === 'pendant') return '錄音吊飾';
  if (element.dataset.safeItem === 'photo') return '男女主角的合照';
  if (element.dataset.photoBack) return '返回保險箱';
  if (element.dataset.photoCard) return photoFlipped ? '翻回照片正面' : '翻看照片背面';
  if (element.dataset.drawerBack) return '返回';
  if (element.dataset.drawerDigit) return `數字 ${element.dataset.drawerDigit}`;
  if (element.dataset.drawerClear) return '清除';
  if (element.dataset.drawerReset) return 'RESET';
  if (element.dataset.drawerDelete) return 'DELETE';
  if (element.dataset.drawerSubmit) return '確認';
  switch (element.dataset.object) {
    case 'wardrobe':
      return '衣櫃 / 外套';
    case 'table':
      return '桌子';
    case 'door':
      return '房門';
    default:
      return '無';
  }
}

function addItem(item: ItemId): boolean {
  if (collectedItems.has(item)) {
    showNotice(`${itemLabels[item]}已經拿過了。`);
    return false;
  }
  const emptySlot = inventorySlots.indexOf(null);
  if (emptySlot === -1) {
    showNotice('物品欄已滿。');
    return false;
  }
  inventorySlots[emptySlot] = item;
  collectedItems.add(item);
  showNotice(`提示(文字)：${itemLabels[item]}`);
  vibrate(80);
  syncControllerState();
  return true;
}

function consumeItem(item: ItemId): void {
  const slot = inventorySlots.indexOf(item);
  if (slot === -1) return;
  inventorySlots[slot] = null;
  if (selectedItem === item) selectedItem = null;
  syncControllerState();
}

function handleInteract(): void {
  if (drawerPuzzleOpen) {
    handleDrawerInteract();
    return;
  }
  if (photoInspectOpen) {
    handlePhotoInspect();
    return;
  }
  if (safeInspectOpen) {
    handleSafeInspect();
    return;
  }

  if (!inventoryOpen) {
    switch (roomTarget) {
      case 'wardrobeLeft':
        if (room3d.openWardrobe('left')) {
          showNotice('衣櫃左門(聲音)：吱……');
          vibrate([45, 55, 75]);
        } else {
          showNotice('衣櫃左門已經打開了。');
        }
        return;
      case 'wardrobeMiddle':
        if (room3d.openWardrobe('middle')) {
          showNotice('衣櫃中門(聲音)：吱……');
          vibrate([45, 55, 75]);
        } else {
          showNotice('衣櫃中門已經打開了。');
        }
        return;
      case 'wardrobeRight':
        if (room3d.openWardrobe('right')) {
          showNotice('衣櫃右門(聲音)：吱……');
          vibrate([45, 55, 75]);
        } else {
          showNotice('衣櫃右門已經打開了。');
        }
        return;
      case 'wardrobe':
        showNotice('衣櫃(文字)：三扇門可以分別打開。');
        return;
      case 'receipt':
        if (addItem('receipt')) room3d.collectObject('receipt');
        return;
      case 'pencil':
        if (addItem('pencil')) room3d.collectObject('pencil');
        return;
      case 'safe':
        openSafeInspect();
        return;
      case 'drawer':
      case 'table':
        if (drawerUnlocked) {
          room3d.openDrawer();
          return;
        }
        if (selectedItem !== 'smallKey') {
          showNotice('桌子抽屜(文字)：鎖孔裡沒有鑰匙。');
          return;
        }
        drawerUnlocked = true;
        consumeItem('smallKey');
        room3d.openDrawer();
        showNotice('桌子抽屜(聲音)：喀……抽屜滑開了。');
        vibrate([55, 45, 90]);
        return;
      case 'tape':
        if (addItem('tape')) room3d.collectObject('tape');
        return;
      case 'oldBattery':
        if (addItem('oldBattery')) room3d.collectObject('oldBattery');
        return;
      case 'smallKey':
        if (addItem('smallKey')) room3d.collectObject('smallKey');
        return;
      case 'recorder':
        if (room3d.hasTapeInRecorder()) {
          showNotice('提示(文字)：錄音帶已經放進去了。');
          return;
        }
        if (selectedItem !== 'tape') {
          showNotice('提示(文字)：錄音機的磁帶槽是空的。');
          return;
        }
        if (room3d.insertTapeIntoRecorder()) {
          consumeItem('tape');
          showNotice('錄音機(聲音)：喀。');
          vibrate([45, 35, 75]);
        }
        return;
      case 'door':
        showNotice('提示(文字)：房門打不開。');
        return;
      default:
        showNotice('沒有可互動的東西。');
        return;
    }
  }

  if (!target) {
    showNotice('沒有可互動的東西。');
    return;
  }
  if (target.dataset.inventoryBack) {
    setInventoryOpen(false);
    return;
  }
  if (target.dataset.receiptPaper) {
    showNotice(
      receiptSolved
        ? '收據背面(文字)：4826'
        : receiptRubEnabled
          ? '提示(文字)：左右晃動手機描出壓痕。'
          : '提示(文字)：需要先選取短鉛筆。',
    );
    return;
  }
}

function renderSafeInspect(): void {
  const hasKey = !collectedItems.has('smallKey');
  const hasPendant = !collectedItems.has('pendant');
  const hasPhoto = !collectedItems.has('photo');

  if (!safeUnlocked) {
    safeInspectImageEl.src = SAFE_INSPECT_IMAGES.closed;
  } else if (!hasPhoto) {
    safeInspectImageEl.src = SAFE_INSPECT_IMAGES.empty;
  } else if (hasKey && hasPendant) {
    safeInspectImageEl.src = SAFE_INSPECT_IMAGES.all;
  } else if (!hasKey && hasPendant) {
    safeInspectImageEl.src = SAFE_INSPECT_IMAGES.noKey;
  } else if (hasKey && !hasPendant) {
    safeInspectImageEl.src = SAFE_INSPECT_IMAGES.noPendant;
  } else {
    safeInspectImageEl.src = SAFE_INSPECT_IMAGES.photoOnly;
  }

  safeInspectEl.classList.toggle('unlocked', safeUnlocked);
  safeInspectEl.classList.toggle('photo-collected', !hasPhoto);
  safeInspectEl.classList.toggle('has-key', safeUnlocked && hasKey);
  safeInspectEl.classList.toggle('has-pendant', safeUnlocked && hasPendant);
  safeKeyHotspotEl.hidden = !safeUnlocked || !hasKey;
  safePendantHotspotEl.hidden = !safeUnlocked || !hasPendant;
  safePhotoHotspotEl.hidden = !safeUnlocked || !hasPhoto;
}

function openSafeInspect(): void {
  if (inventoryOpen) setInventoryOpen(false);
  safeInspectOpen = true;
  pointer = { x: 0, y: 0 };
  move = { x: 0, y: 0 };
  safeInspectEl.classList.add('open');
  renderSafeInspect();
  showNotice(
    safeUnlocked
      ? '保險箱(文字)：門已經打開了。'
      : '保險箱(文字)：門上裝著四位數字鎖。',
  );
  syncControllerState();
  updatePointer(0, 0);
}

function closeSafeInspect(): void {
  safeInspectOpen = false;
  pointer = { x: 0, y: 0 };
  move = { x: 0, y: 0 };
  safeInspectEl.classList.remove('open');
  syncControllerState();
  updatePointer(0, 0);
}

function handleSafeInspect(): void {
  if (!target) {
    showNotice('沒有可互動的東西。');
    return;
  }
  if (target.dataset.safeBack) {
    closeSafeInspect();
    return;
  }
  if (target.dataset.safeKeypad) {
    if (safeUnlocked) {
      showNotice('保險箱(文字)：門鎖已經解開。');
      return;
    }
    openDrawerPuzzle();
    return;
  }

  switch (target.dataset.safeItem) {
    case 'smallKey':
      if (addItem('smallKey')) {
        room3d.collectObject('smallKey');
        renderSafeInspect();
      }
      return;
    case 'pendant':
      if (addItem('pendant')) renderSafeInspect();
      return;
    case 'photo':
      openPhotoInspect();
      return;
    default:
      showNotice('沒有可互動的東西。');
  }
}

function openPhotoInspect(): void {
  photoInspectOpen = true;
  photoFlipped = false;
  pointer = { x: 0, y: 0 };
  move = { x: 0, y: 0 };
  photoInspectEl.classList.add('open');
  photoInspectEl.classList.remove('flipped');
  photoCardEl.setAttribute('aria-label', '翻看照片背面');
  showNotice('合照(文字)：照片裡的兩個人靠得很近。');
  vibrate([35, 55, 35]);
  syncControllerState();
  updatePointer(0, 0);
}

function closePhotoInspect(): void {
  photoInspectOpen = false;
  photoFlipped = false;
  pointer = { x: 0, y: 0 };
  move = { x: 0, y: 0 };
  photoInspectEl.classList.remove('open', 'flipped');
  syncControllerState();
  updatePointer(0, 0);
}

function handlePhotoInspect(): void {
  if (!target) {
    showNotice('沒有可互動的東西。');
    return;
  }
  if (target.dataset.photoBack) {
    closePhotoInspect();
    return;
  }
  if (target.dataset.photoCard) {
    if (!photoFlipped) {
      photoFlipped = true;
      photoInspectEl.classList.add('flipped');
      photoCardEl.setAttribute('aria-label', '拿起照片');
      showNotice('照片背面(文字)：聽見那些聲音…… 按一下…… 吊飾……');
      vibrate(45);
      updateTarget();
      return;
    }
    if (addItem('photo')) {
      closePhotoInspect();
      renderSafeInspect();
    }
    return;
  }
  showNotice('沒有可互動的東西。');
}

function updateDrawerCodeDisplay(): void {
  drawerCodeDisplayEl.textContent = Array.from(
    { length: 4 },
    (_, index) => drawerCode[index] ?? '_',
  ).join(' ');
}

function openDrawerPuzzle(): void {
  if (inventoryOpen) setInventoryOpen(false);
  drawerPuzzleOpen = true;
  drawerCode = '';
  pointer = { x: 0, y: 0 };
  move = { x: 0, y: 0 };
  drawerPuzzleEl.classList.add('open');
  updateDrawerCodeDisplay();
  showNotice('保險箱(文字)：四位數字鎖。');
  syncControllerState();
  updatePointer(0, 0);
}

function closeDrawerPuzzle(): void {
  drawerPuzzleOpen = false;
  drawerCode = '';
  pointer = { x: 0, y: 0 };
  move = { x: 0, y: 0 };
  drawerPuzzleEl.classList.remove('open');
  updateDrawerCodeDisplay();
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function handleDrawerInteract(): void {
  if (!target) {
    showNotice('沒有可互動的東西。');
    return;
  }
  if (target.dataset.drawerBack) {
    closeDrawerPuzzle();
    return;
  }
  if (target.dataset.drawerClear || target.dataset.drawerReset) {
    playKeypadResetSound();
    drawerCode = '';
    updateDrawerCodeDisplay();
    vibrate(20);
    return;
  }
  if (target.dataset.drawerDelete) {
    playKeypadResetSound();
    drawerCode = drawerCode.slice(0, -1);
    updateDrawerCodeDisplay();
    vibrate(20);
    return;
  }
  const digit = target.dataset.drawerDigit;
  if (digit) {
    playKeypadSound();
    if (drawerCode.length < 4) drawerCode += digit;
    updateDrawerCodeDisplay();
    vibrate(18);
    return;
  }
  if (!target.dataset.drawerSubmit) return;

  if (drawerCode !== '4826') {
    drawerCode = '';
    updateDrawerCodeDisplay();
    showNotice('保險箱(聲音)：喀。');
    vibratePuzzleError();
    return;
  }

  playKeypadUnlockSound();
  safeUnlocked = true;
  closeDrawerPuzzle();
  room3d.openSafe();
  renderSafeInspect();
  showNotice('保險箱(聲音)：喀……門鎖彈開了。');
  vibrate([80, 70, 80]);
}

function handleItemAction(item: ItemId, action: ProtoItemAction): void {
  if (!inventorySlots.includes(item)) return;
  if (action === 'inspect') {
    openItemDetail(item);
    return;
  }
  if (inventoryOpen && detailItem === item) {
    setInventoryOpen(false);
    showNotice(`已收起：${itemLabels[item]}`);
    return;
  }

  selectedItem = item;
  receiptRubEnabled = receiptInspectOpen && item === 'pencil';
  receiptPanelEl.classList.toggle('rubbing', receiptRubEnabled);
  lastRubPointer = null;
  if (!receiptRubEnabled) stopPencilSound();
  showNotice(
    receiptRubEnabled
      ? '使用中：短鉛筆。將游標移到收據上，左右描出壓痕。'
      : `使用中：${itemLabels[item]}`,
  );
  syncControllerState();
}

function openItemDetail(item: ItemId): void {
  if (drawerPuzzleOpen) closeDrawerPuzzle();
  if (photoInspectOpen) closePhotoInspect();
  if (safeInspectOpen) closeSafeInspect();
  detailItem = item;
  inventoryOpen = true;
  receiptInspectOpen = item === 'receipt';
  receiptRubEnabled = receiptInspectOpen && selectedItem === 'pencil';
  inventoryEl.classList.add('open');
  receiptPanelEl.classList.toggle('open', item === 'receipt');
  receiptPanelEl.classList.toggle('rubbing', receiptRubEnabled);
  pencilPanelEl.classList.toggle('open', item === 'pencil');
  const useGenericPanel = item !== 'receipt' && item !== 'pencil';
  genericItemPanelEl.classList.toggle('open', useGenericPanel);
  if (useGenericPanel) {
    genericItemPreviewImage.src = itemDetails[item].image;
    genericItemPreviewImage.alt = itemLabels[item];
    genericItemNameEl.textContent = itemLabels[item];
    genericItemDescriptionEl.textContent = itemDetails[item].description;
  }
  lastRubPointer = null;
  showNotice(
    item === 'receipt'
      ? receiptRubEnabled
        ? '提示(文字)：將游標移到收據上，左右描出壓痕。'
        : '提示(文字)：壓痕太淡，需要能描線的工具。'
      : `${itemLabels[item]}。${itemDetails[item].description}`,
  );
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function setInventoryOpen(open: boolean): void {
  inventoryOpen = open;
  inventoryEl.classList.toggle('open', open);
  if (!open) {
    pointer = { x: 0, y: 0 };
    detailItem = null;
    receiptInspectOpen = false;
    receiptPanelEl.classList.remove('open', 'rubbing');
    pencilPanelEl.classList.remove('open');
    genericItemPanelEl.classList.remove('open');
    genericItemPreviewImage.removeAttribute('src');
    genericItemPreviewImage.alt = '';
    lastRubPointer = null;
    receiptRubEnabled = false;
  }
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function updateReceiptCode(): void {
  receiptCodeEl.textContent = '_ _ _ _';
  receiptCodeEl.style.setProperty('--rub-progress', `${receiptRubProgress}%`);
  if (receiptRubProgress >= 100 && !receiptSolved) {
    receiptSolved = true;
    receiptRubEnabled = false;
    receiptPanelEl.classList.remove('rubbing');
    stopPencilSound();
    showNotice('主角(聲音)：壓痕……描出來了。');
    vibrate([90, 80, 90]);
    consumeItem('pencil');
  }
}

let lastTime = performance.now();

function frame(time: number): void {
  const delta = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  const movedDistance = room3d.update(delta, time / 1000, pointer, move, !isInterfaceOpen());
  updateFootsteps(movedDistance);

  if (!isInterfaceOpen()) updateTarget();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => room3d.resize());
window.addEventListener('pointerdown', unlockHostAudio, { capture: true });
window.addEventListener('keydown', unlockHostAudio, { capture: true });
audioEnableBtn.addEventListener('click', () => void toggleHostAudio());
ambienceAudio.addEventListener('playing', updateHostAudioButton);
ambienceAudio.addEventListener('pause', updateHostAudioButton);

window.addEventListener('mousemove', (event) => {
  if (ws) return;
  updatePointer((event.clientX / window.innerWidth) * 2 - 1, -((event.clientY / window.innerHeight) * 2 - 1));
});

void showQr();
connect();
updateReceiptCode();
updateHostAudioButton();
ambienceAudio.load();
void startAmbientAudio();
const initialAudioContext = ensureHostAudioContext();
if (initialAudioContext) {
  void loadHostAudioAssets(initialAudioContext).then(updateHostAudioButton).catch(updateHostAudioButton);
}

requestAnimationFrame(frame);
