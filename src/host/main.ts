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
import {
  StoryDirector,
  type ManifestationEffect,
  type PhotoInspectionState,
  type StoryVisualState,
  type TapePlaybackState,
} from './story-director';
import { createScene, VIEWPOINT } from './scene';
import { STORY_SCREENS, type StoryScreenId } from '../shared/story';
import { NARRATION_CUES } from '../shared/narration';
import { VideoStoryPlayer } from './video-story-player';
import type { ControllerCueId } from '../shared/protocol';

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
const hostCode = document.querySelector<HTMLDivElement>('#host-code')!;
const hostChoices = document.querySelector<HTMLDivElement>('#host-choices')!;
const photoInspection = document.querySelector<HTMLDivElement>('#photo-inspection')!;
const photoInspectionHint = document.querySelector<HTMLParagraphElement>('#photo-inspection-hint')!;
const tapePlayback = document.querySelector<HTMLDivElement>('#tape-playback')!;
const doorListening = document.querySelector<HTMLDivElement>('#door-listening')!;
const peripheralShadow = document.querySelector<HTMLDivElement>('#peripheral-shadow')!;
const roomPulse = document.querySelector<HTMLDivElement>('#room-pulse')!;
const interactionPrompt = document.querySelector<HTMLDivElement>('#interaction-prompt')!;
const storyNotice = document.querySelector<HTMLDivElement>('#story-notice')!;
const voiceCaption = document.querySelector<HTMLDivElement>('#voice-caption')!;
const voiceSpeaker = document.querySelector<HTMLSpanElement>('#voice-speaker')!;
const voiceLine = document.querySelector<HTMLSpanElement>('#voice-line')!;
const videoStoryContainer = document.querySelector<HTMLDivElement>('#video-story')!;
const videoStoryAction = document.querySelector<HTMLDivElement>('#video-story-action')!;
const videoStoryChoices = document.querySelector<HTMLDivElement>('#video-story-choices')!;
const videoStoryLeft = videoStoryChoices.querySelector<HTMLDivElement>("[data-side='left']")!;
const videoStoryRight = videoStoryChoices.querySelector<HTMLDivElement>("[data-side='right']")!;
const videoPilotMode = new URLSearchParams(location.search).get('mode') === 'video';
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
let actionPulse = false;
let experienceStarting = false;
let voiceCaptionTimer: ReturnType<typeof setTimeout> | null = null;
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
  storyHud.dataset.kind = screen.kind;
  hostCode.hidden = screen.kind !== 'keypad';
  hostChoices.hidden = screen.kind !== 'choice';
  storyHud.classList.toggle('active', screenId !== 'standby');
  setVoiceCaption(screenId);
}

function setVoiceCaption(screenId: StoryScreenId): void {
  if (voiceCaptionTimer !== null) clearTimeout(voiceCaptionTimer);
  voiceCaptionTimer = null;
  voiceCaption.classList.remove('active');
  const cue = NARRATION_CUES[screenId];
  if (!cue) {
    voiceSpeaker.textContent = '';
    voiceLine.textContent = '';
    return;
  }
  voiceCaption.dataset.role = cue.role;
  voiceSpeaker.textContent = `${cue.speaker}｜`;
  voiceLine.textContent = `「${cue.text}」`;
  voiceCaptionTimer = setTimeout(() => {
    voiceCaptionTimer = null;
    voiceCaption.classList.add('active');
  }, cue.delayMs ?? 0);
}

function showVideoCaption(text: string): void {
  if (voiceCaptionTimer !== null) clearTimeout(voiceCaptionTimer);
  voiceCaptionTimer = null;
  voiceCaption.classList.remove('active');
  voiceCaption.dataset.role = 'entity';
  voiceSpeaker.textContent = '407 房內線｜';
  voiceLine.textContent = `「${text}」`;
  void voiceCaption.offsetWidth;
  voiceCaption.classList.add('active');
  voiceCaptionTimer = setTimeout(() => {
    voiceCaptionTimer = null;
    voiceCaption.classList.remove('active');
  }, Math.max(2200, Math.min(5200, text.length * 260)));
}

function controllerCueForVideo(id: string): ControllerCueId | null {
  if (id === 'ring') return 'ring';
  if (id === 'jumpscare') return 'jumpscare';
  if (id === 'impact') return 'impact';
  if (id === 'voice-warning') return 'voice-warning';
  if (id === 'voice-door') return 'voice-door';
  if (id === 'voice-wrong-side') return 'voice-wrong-side';
  if (id === 'scratch' || id === 'breath') return 'whisper';
  return null;
}

function setCodeDigits(value: string): void {
  const digits = value.split('');
  hostCode.textContent = Array.from({ length: 4 }, (_, index) => digits[index] ?? '_').join(' ');
}

function setChoiceFocus(choice: 'seal' | 'open' | null): void {
  hostChoices.dataset.focus = choice ?? '';
}

function setPhotoInspection(state: PhotoInspectionState): void {
  photoInspection.hidden = state === 'hidden';
  photoInspection.dataset.side = state === 'hidden' ? 'front' : state;
  photoInspectionHint.textContent =
    state === 'back' ? '先聽幾秒，再按中央鍵把照片放回去' : '按手機中央鍵查看照片背面';
}

function setTapePlayback(state: TapePlaybackState): void {
  if (state === 'hidden') {
    tapePlayback.hidden = true;
    tapePlayback.dataset.track = 'warning-one';
    return;
  }
  // 每一面錄音都重新開始轉輪、字幕與 7.2 秒進度，避免第二段沿用第一段動畫時間。
  tapePlayback.hidden = true;
  tapePlayback.dataset.track = state;
  void tapePlayback.offsetWidth;
  tapePlayback.hidden = false;
}

function setDoorListening(active: boolean): void {
  doorListening.hidden = !active;
}

function setCinematicChromeHidden(hidden: boolean): void {
  document.body.classList.toggle('cinematic-lock', hidden);
}

function triggerManifestation(effect: ManifestationEffect): void {
  if (effect === 'shadow-left' || effect === 'shadow-right') {
    peripheralShadow.dataset.side = '';
    void peripheralShadow.offsetWidth;
    peripheralShadow.dataset.side = effect === 'shadow-left' ? 'left' : 'right';
    return;
  }
  roomPulse.dataset.effect = '';
  void roomPulse.offsetWidth;
  roomPulse.dataset.effect = effect;
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
    setCodeDigits,
    setChoiceFocus,
    setPhotoInspection,
    setTapePlayback,
    setDoorListening,
    setCinematicChromeHidden,
    triggerManifestation,
    showNotice: showStoryNotice,
    onEnding: (ending) => {
      setStatus(ending === 'sealed' ? '封印成功；按手機中央鍵再玩一次' : '封印解除；按手機中央鍵再玩一次');
    },
    onRestart: () => {
      hideExperienceOverlay();
      setStatus('407 號房點交進行中');
    },
  },
);

const videoPlayer = new VideoStoryPlayer(videoStoryContainer, {
  onNodeChange: (id) => {
    videoStoryContainer.hidden = false;
    videoStoryAction.hidden = true;
    videoStoryChoices.hidden = true;
    videoStoryChoices.dataset.focus = '';
    showStoryNotice('');
    setStatus(`互動影片：${id}`);
  },
  onCue: (cue) => {
    const controllerAudio = cue.audio ? controllerCueForVideo(cue.audio) : null;
    if (cue.audio === 'scratch') audio.playDoor();
    if (cue.audio === 'impact') audio.playSting(0.8);
    if (cue.audio === 'jumpscare') audio.playJumpscare();
    if (cue.caption) showVideoCaption(cue.caption);
    if (cue.narration) showVideoCaption(cue.narration);
    if (controllerAudio || cue.narration || cue.haptic) {
      sendToController({
        type: 'fmv-cue',
        ...(controllerAudio ? { audio: controllerAudio } : {}),
        ...(cue.narration ? { narration: cue.narration, role: 'entity' } : {}),
        ...(cue.haptic === 'long' || cue.haptic === 'double-short' ? { haptic: cue.haptic } : {}),
      });
    }
  },
  onAction: (action) => {
    videoStoryChoices.hidden = true;
    videoStoryAction.textContent = `按手機中央鍵｜${action.prompt}`;
    videoStoryAction.hidden = false;
  },
  onChoice: (choice) => {
    videoStoryAction.hidden = true;
    const left = choice.options.find((option) => option.screenSide === 'left');
    const right = choice.options.find((option) => option.screenSide === 'right');
    videoStoryLeft.textContent = left?.label ?? '';
    videoStoryRight.textContent = right?.label ?? '';
    videoStoryChoices.hidden = false;
    showVideoCaption('選一個。不要低頭。');
  },
  onChoiceFocus: (side) => {
    videoStoryChoices.dataset.focus = side ?? '';
  },
  onEnding: (ending) => {
    videoStoryAction.hidden = true;
    setStatus(`互動影片結局：${ending}；按手機中央鍵重新開始`);
    showStoryNotice('試片結束。按手機中央鍵，從來電重新開始。');
  },
  onIncomplete: (id) => {
    videoStoryAction.hidden = true;
    videoStoryChoices.hidden = true;
    setStatus(`試片已播放至 ${id}；下一段影片仍在製作`);
    showStoryNotice('下一段影像正在生成；目前停在可銜接的最後一格。');
  },
  onError: (error) => {
    // cinematic-lock 會把 #status-line 藏起來；錯誤必須同時走 story-notice 才看得到。
    setStatus(`互動影片無法播放：${error.message}`);
    showStoryNotice(`影片無法播放：${error.message}`);
  },
  onAutoplayBlocked: () => {
    setStatus('電視瀏覽器擋下自動播放，等待畫面上的一次操作');
    videoStoryAction.textContent = '電視擋下了自動播放｜請按遙控器確認鍵，或點一下電視畫面';
    videoStoryAction.hidden = false;
  },
  onPlaybackRecovered: () => {
    videoStoryAction.hidden = true;
    setStatus('影片已恢復播放');
  },
  onStallRecovery: (stage) => {
    showStoryNotice(
      stage === 1 ? '影片未起播：改用 1.0 倍速重試…' : '影片未起播：改用單層播放重試…',
    );
  },
  onBuffering: () => showStoryNotice('影片載入中…'),
});
const videoStoryReady = videoPilotMode
  ? videoPlayer.load(publicUrl('assets/video-pilot/story-graph.json'))
  : Promise.resolve(null);

// 電視除錯：video 模式常駐一行狀態（bundle 版本＋播放器內部狀態）。
// 電視瀏覽器打不開 devtools，也常快取舊版頁面；這行是唯一的現場證據。
if (videoPilotMode) {
  const videoDiagEl = document.querySelector<HTMLParagraphElement>('#video-diag')!;
  const bundleId =
    document.querySelector<HTMLScriptElement>('script[src*="host-"]')?.src.match(/host-([\w-]+)\.js/)?.[1] ??
    'dev';
  setInterval(() => {
    videoDiagEl.textContent = `v:${bundleId}｜${videoPlayer.debugState()}`;
  }, 500);
}

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
  experienceTitle.textContent = videoPilotMode ? '407 號房：互動試片' : '407 號房：最後點交';
  experienceCopy.textContent = videoPilotMode
    ? '手機只需中央鍵；選擇會顯示在大螢幕，角色語音與震動由手機同步'
    : '把手機音量開大；中央鍵直接開始，角色語音由手機播放。主機聲音可選擇同步';
  experienceButton.textContent = '主機聲音＋開始';
  experienceOverlay.hidden = false;
}

function startExperience(useHostGesture = false): void {
  if (!controllerReady || experienceStarting || experienceOverlay.hidden) return;
  experienceStarting = true;

  // 瀏覽器只接受「本頁」的真實點擊來解鎖 Web Audio。手機透過 WebSocket 啟動時
  // 不建立主機 AudioContext，避免 Chrome 反覆拋出 autoplay 警告；聲音改由手機播放。
  const soundStart = useHostGesture ? audio.start() : Promise.resolve(false);
  hideExperienceOverlay();
  if (videoPilotMode) {
    document.body.classList.add('video-story-mode', 'cinematic-lock');
    // 電視按鈕啟動時趁真實點擊手勢先解鎖兩層 video；手機遠端啟動沒有本頁手勢可用，
    // play() 若被擋會走 onAutoplayBlocked 的遙控器恢復流程。
    if (useHostGesture) videoPlayer.primeWithGesture();
    audio.startScore();
    audio.setTension(0.26);
    sendToController({ type: 'cue', id: 'ambience-start' });
    void videoStoryReady
      .then(() => videoPlayer.start())
      .catch((error) => {
        setStatus(`互動影片載入失敗：${String(error)}`);
        showStoryNotice('互動影片載入失敗；請重新整理電視頁面再試');
      });
  } else {
    director.start();
  }
  setStatus(useHostGesture ? '體驗開始；主機聲音已請求啟動' : '體驗開始；聲音由手機播放');
  experienceStarting = false;

  void soundStart.then((soundStarted) => {
    if (soundStarted) {
      soundButton.hidden = true;
      return;
    }
    if (useHostGesture) setStatus('體驗已開始；若未聽到主機聲音，請再按左上角啟動音效');
  });
}

experienceButton.addEventListener('click', () => startExperience(true));

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
    actionPulse = false;
    flashlight.setConnected(false);
    director.reset();
    videoPlayer.reset();
    videoStoryContainer.hidden = true;
    videoStoryAction.hidden = true;
    videoStoryChoices.hidden = true;
    document.body.classList.remove('video-story-mode');
    hideExperienceOverlay();
    overlayEl.classList.remove('hidden');
    setStatus('等待控制器（滑鼠可控光錐）');
    return;
  }
  // 每次 status=true 都代表一次新的 controller 註冊；last-wins 取代時不一定先收到 false。
  controllerReady = false;
  actionPressed = false;
  actionPulse = false;
  flashlight.setConnected(false);
  director.reset();
  videoPlayer.reset();
  videoStoryContainer.hidden = true;
  videoStoryAction.hidden = true;
  videoStoryChoices.hidden = true;
  document.body.classList.remove('video-story-mode');
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
        if (msg.pressed) actionPulse = true;
        if (msg.pressed && !experienceOverlay.hidden) {
          startExperience(false);
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
  if (videoPilotMode && document.body.classList.contains('video-story-mode')) {
    videoPlayer.update(actionPressed || actionPulse, hasDirection ? flashlightDirection.x : null);
  } else {
    director.update(delta, direction, actionPressed || actionPulse);
  }
  actionPulse = false;
  handles.cinematic.update(delta, hasDirection ? flashlightDirection : null);
  handles.jumpscare.update(delta);
  handles.render();
  requestAnimationFrame(frame);
}

void showQr();
connect();
setControllerConnected(false);
requestAnimationFrame(frame);
