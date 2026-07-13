// Host 頁（Phase 3）：Three.js 暗房 + 手電筒光錐跟隨控制器指向。
// 未連控制器時顯示 QR 疊層並開放滑鼠 fallback；連上後淡出。

import QRCode from 'qrcode';
import { Clock, Vector3 } from 'three';
import { parseMessage } from '../shared/protocol';
import { publicUrl } from '../shared/public-url';
import { buildWebSocketUrl, createRoomCode, normalizeRoomCode } from '../shared/session';
import { Flashlight } from './flashlight';
import { createCalibrationUi } from './calibration-ui';
import { HostAudioEngine } from './audio';
import { StoryDirector, type StoryVisualState } from './story-director';
import { createScene, VIEWPOINT } from './scene';
import { STORY_SCREENS, type StoryScreenId } from '../shared/story';

const stageCanvas = document.querySelector<HTMLCanvasElement>('#stage')!;
const overlayEl = document.querySelector<HTMLDivElement>('#overlay')!;
const qrCanvas = document.querySelector<HTMLCanvasElement>('#qr')!;
const joinUrlEl = document.querySelector<HTMLParagraphElement>('#join-url')!;
const statusLineEl = document.querySelector<HTMLParagraphElement>('#status-line')!;
const soundButton = document.querySelector<HTMLButtonElement>('#sound-toggle')!;
const experienceOverlay = document.querySelector<HTMLDivElement>('#experience-overlay')!;
const experienceTitle = document.querySelector<HTMLHeadingElement>('#experience-title')!;
const experienceCopy = document.querySelector<HTMLParagraphElement>('#experience-copy')!;
const experienceButton = document.querySelector<HTMLButtonElement>('#experience-start')!;
const storyVisuals = document.querySelector<HTMLDivElement>('#story-visuals')!;
const storyHud = document.querySelector<HTMLElement>('#story-hud')!;
const storyEyebrow = document.querySelector<HTMLElement>('#story-eyebrow')!;
const storyTitle = document.querySelector<HTMLElement>('#story-title')!;
const storyBody = document.querySelector<HTMLElement>('#story-body')!;
const storyObjective = document.querySelector<HTMLElement>('#story-objective')!;
const interactionPrompt = document.querySelector<HTMLDivElement>('#interaction-prompt')!;
const storyNotice = document.querySelector<HTMLDivElement>('#story-notice')!;
const roomCode =
  normalizeRoomCode(new URLSearchParams(location.search).get('room')) ??
  normalizeRoomCode(sessionStorage.getItem('corner-horror-room')) ??
  createRoomCode();
sessionStorage.setItem('corner-horror-room', roomCode);

const handles = createScene(stageCanvas);
const flashlight = new Flashlight(handles.spotlight, handles.lightTarget, VIEWPOINT);
createCalibrationUi(handles.setProjectionCorners);
const audio = new HostAudioEngine();

let hostWs: WebSocket | null = null;
let controllerReady = false;
let actionPressed = false;
let experienceStarting = false;
function sendToController(payload: unknown): void {
  if (hostWs?.readyState === WebSocket.OPEN) hostWs.send(JSON.stringify(payload));
}

function setStoryScreen(screenId: StoryScreenId): void {
  const screen = STORY_SCREENS[screenId];
  storyEyebrow.textContent = screen.eyebrow;
  storyTitle.textContent = screen.title;
  storyBody.textContent = screen.body;
  storyObjective.textContent = screen.objective ?? '';
  storyObjective.hidden = !screen.objective;
  storyHud.classList.toggle('active', screenId !== 'standby');
}

function setStoryVisual(state: StoryVisualState): void {
  storyVisuals.dataset.window = state.window;
  storyVisuals.dataset.portrait = state.portrait;
  storyVisuals.dataset.drawer = state.drawer;
  storyVisuals.dataset.door = state.door;
  storyVisuals.dataset.footsteps = String(state.footsteps);
}

function setInteractionPrompt(text: string | null): void {
  interactionPrompt.textContent = text ?? '';
  interactionPrompt.classList.toggle('active', text !== null);
}

function showStoryNotice(text: string): void {
  storyNotice.textContent = text;
  storyNotice.classList.remove('show');
  void storyNotice.offsetWidth;
  storyNotice.classList.add('show');
}

const director = new StoryDirector(
  VIEWPOINT,
  audio,
  {
    sendScreen: (screen) => {
      setStoryScreen(screen);
      sendToController({ type: 'story', screen });
    },
    sendCue: (id) => sendToController({ type: 'cue', id }),
    setFrame: (frame) => handles.cinematic.setFrame(frame),
    setJumpscareVisible: (visible) => {
      if (visible) handles.jumpscare.trigger();
      else handles.jumpscare.reset();
    },
    setVisual: setStoryVisual,
    setPrompt: setInteractionPrompt,
    showNotice: showStoryNotice,
    onEnding: (ending) => {
      setStatus(ending === 'sealed' ? '封印成功；可在手機選擇再玩一次' : '封印解除；可在手機選擇再玩一次');
    },
    onRestart: () => {
      hideExperienceOverlay();
      setStatus('407 號房點交進行中');
    },
  },
);

let kicked = false;

soundButton.addEventListener('click', () => {
  void audio.start().then((started) => {
    if (started) {
      soundButton.hidden = true;
      setStatus('房間聲音已啟動');
    } else {
      setStatus('此瀏覽器無法啟動 Web Audio');
    }
  });
});

function setStatus(text: string): void {
  statusLineEl.textContent = text;
}

function hideExperienceOverlay(): void {
  experienceOverlay.hidden = true;
}

function showExperienceStart(): void {
  experienceTitle.textContent = '407 號房：最後點交';
  experienceCopy.textContent = '戴上手機耳機，把手機指向畫面中央；按手機的「開始／動作」進房';
  experienceButton.textContent = '從主機開始';
  experienceOverlay.hidden = false;
}

function startExperience(): void {
  if (!controllerReady || experienceStarting || experienceOverlay.hidden) return;
  experienceStarting = true;

  // 必須在主機 click 的同步呼叫鏈內嘗試解鎖 Web Audio；但手機傳來的
  // WebSocket 事件不算主機端使用者手勢，因此不能讓音效狀態擋住影像流程。
  const soundStart = audio.start();
  hideExperienceOverlay();
  director.start();
  setStatus('體驗開始');
  experienceStarting = false;

  void soundStart.then((soundStarted) => {
    if (soundStarted) {
      soundButton.hidden = true;
      return;
    }
    setStatus('體驗已開始；房間聲音請於主機按「啟動房間聲音」');
  });
}

experienceButton.addEventListener('click', startExperience);

async function showQr(): Promise<void> {
  try {
    let url = new URL(publicUrl('controller.html'), location.origin);
    if (import.meta.env.DEV) {
      const response = await fetch('/api/net');
      const { ip, port } = (await response.json()) as { ip: string | null; port: number };
      url = new URL(`${location.protocol}//${ip ?? location.hostname}:${port}/controller.html`);
    }
    url.searchParams.set('room', roomCode);
    await QRCode.toCanvas(qrCanvas, url.toString(), { width: 240, margin: 1 });
    joinUrlEl.textContent = url.toString();
  } catch (err) {
    setStatus(`QR 產生失敗：${String(err)}`);
  }
}

function setControllerConnected(connected: boolean): void {
  if (!connected) {
    controllerReady = false;
    actionPressed = false;
    flashlight.setConnected(false);
    director.reset();
    hideExperienceOverlay();
    overlayEl.classList.remove('hidden');
    setStatus('等待控制器（滑鼠可控光錐）');
    return;
  }
  // 每次 status=true 都代表一次新的 controller 註冊；last-wins 取代時不一定先收到 false。
  controllerReady = false;
  actionPressed = false;
  flashlight.setConnected(false);
  director.reset();
  hideExperienceOverlay();
  overlayEl.classList.remove('hidden');
  setStatus('控制器已連線，請在手機按「開始」');
}

function markControllerReady(hasOrientation: boolean): void {
  if (hasOrientation) flashlight.setConnected(true);
  if (!controllerReady) {
    controllerReady = true;
    overlayEl.classList.add('hidden');
    showExperienceStart();
    setStatus(hasOrientation ? '控制器已就緒，等待開始體驗' : '手機已就緒；可用主畫面滑鼠控制光錐');
  }
}

function connect(): void {
  let endpoint: string;
  try {
    endpoint = buildWebSocketUrl(roomCode, import.meta.env.VITE_WS_URL, location.href);
  } catch {
    setStatus('WebSocket 後端網址設定錯誤');
    return;
  }
  const ws = new WebSocket(endpoint);
  hostWs = ws;

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'hello', role: 'host' }));
  });

  ws.addEventListener('message', (ev) => {
    const msg = parseMessage(ev.data);
    if (!msg) return;
    switch (msg.type) {
      case 'status':
        setControllerConnected(msg.controller);
        break;
      case 'orient':
        markControllerReady(true);
        flashlight.setTargetQuaternion(msg.q);
        break;
      case 'ready':
        markControllerReady(false);
        break;
      case 'btn':
        actionPressed = msg.pressed;
        if (msg.pressed && !experienceOverlay.hidden) {
          startExperience();
        } else if (experienceOverlay.hidden) {
          setStatus(`action ${msg.pressed ? 'down' : 'up'}`);
        }
        break;
      case 'story-action':
        director.handleStoryAction(msg.id, msg.value);
        break;
      case 'kick':
        kicked = true;
        setStatus('已被另一個 host 頁取代，停止重連');
        break;
    }
  });

  ws.addEventListener('close', () => {
    if (hostWs === ws) hostWs = null;
    setControllerConnected(false);
    if (kicked) return;
    setStatus('與伺服器斷線，1 秒後重連');
    setTimeout(connect, 1000);
  });
}

// 滑鼠 fallback：只在無控制器時作用
window.addEventListener('mousemove', (ev) => {
  if (flashlight.isConnected) return;
  const ndcX = (ev.clientX / innerWidth) * 2 - 1;
  const ndcY = -(ev.clientY / innerHeight) * 2 + 1;
  flashlight.pointAt(ndcX, ndcY, handles.camera);
});

window.addEventListener('resize', handles.resize);

const clock = new Clock();
const flashlightDirection = new Vector3();
function frame(): void {
  const delta = Math.min(clock.getDelta(), 0.1); // 分頁休眠回來的大 dt 夾住
  flashlight.update(delta);
  const hasDirection = flashlight.getDirection(flashlightDirection);
  const direction = hasDirection
    ? ([flashlightDirection.x, flashlightDirection.y, flashlightDirection.z] as [number, number, number])
    : null;
  director.update(delta, direction, actionPressed);
  handles.cinematic.update(delta, hasDirection ? flashlightDirection : null);
  handles.jumpscare.update(delta);
  handles.render();
  requestAnimationFrame(frame);
}

void showQr();
connect();
setControllerConnected(false);
requestAnimationFrame(frame);
