import QRCode from 'qrcode';
import {
  parseMessage,
  type ProtoItemAction,
  type ProtoItemId,
} from '../shared/protocol';
import { publicUrl } from '../shared/public-url';
import { clearSave } from '../shared/persistence';
import { buildWebSocketUrl, createRoomCode, normalizeRoomCode } from '../shared/session';
import {
  SAFE_CODE,
  canUnlockRoomDoor,
  tapeRecordingLines,
  type TapeVoiceClipId,
} from './chapter-one';
import { addBedShakeProgress, BED_SHAKE_TARGET, hasEscapedBedGrab } from './bed-escape';
import {
  BED_AUDIO_CUES,
  bedDeathPlaybackRate,
  shouldStartBedPlayerScream,
} from './bed-audio-cues';
import {
  BED_BLOOD_HOLD_MS,
  buildBedDeathRestartUrl,
  clearBedDeathInventory,
} from './bed-death-flow';
import { PrototypeRoom2D, type RoomObjectId } from './room2d';
import {
  advanceHorizontalCut,
  beginHorizontalCut,
  type HorizontalCutGesture,
} from './horizontal-cut-gesture';
import {
  combineFirefighterEquipment,
  mergeFirefighterEquipmentOnCollect,
} from './inventory-combination';
import { installPendantBattery } from './inventory-actions';
import { shouldRefreshControllerState } from './controller-sync';

type ItemId = ProtoItemId;
type StoryPhotoId = 'familyPhoto' | 'firefighterPhoto' | 'girlfriendPhoto';
type AwardPreviewId = 'firefighterAward';

const itemLabels: Record<ItemId, string> = {
  receipt: '便條紙',
  smallKey: '鑰匙',
  oldBattery: '舊電池',
  tape: '錄音磁帶',
  pendant: '錄音吊飾',
  photo: '男女主角的合照',
  antenna: '脫落的天線',
  boxCutter: '美工刀',
  firefighterGear: '消防衣與頭盔',
  firefighterMask: '消防面罩',
  completeFirefighterGear: '完整消防裝備',
};

const awardLabels: Partial<Record<RoomObjectId, string>> = {
  firefighterAward: '祈彥殉職褒揚狀',
};

const itemDetails: Record<ItemId, { image: string; description: string }> = {
  receipt: {
    image: publicUrl('assets/room307/props/number-guess-note-v1.png'),
    description: '寫著三組猜數字紀錄，最後一行已經模糊不清。',
  },
  smallKey: {
    image: publicUrl('assets/inventory-icons/key-user.png'),
    description: '一把小型黃銅鑰匙，尺寸像是用來開書桌抽屜。',
  },
  oldBattery: {
    image: publicUrl('assets/inventory-icons/battery-environment.png'),
    description: '一顆表面氧化的舊電池，仍殘留微弱電力。',
  },
  tape: {
    image: publicUrl('assets/inventory-icons/cassette-environment.png'),
    description: '外殼被煙燻黑，標籤上的字已經看不清楚。',
  },
  pendant: {
    image: publicUrl('assets/inventory-icons/pendant-user.png'),
    description: '主角送給女友的錄音吊飾，但背面的電池槽目前是空的。',
  },
  photo: {
    image: publicUrl('assets/room307/photos/男女主角照片.png'),
    description: '照片背面留著女友寫給主角的一段話。',
  },
  antenna: {
    image: publicUrl('assets/inventory-icons/antenna.png'),
    description: '從收錄音機上脫落的伸縮天線，接頭仍然完整。',
  },
  boxCutter: {
    image: publicUrl('assets/inventory-icons/utility-knife-v1.png'),
    description: '一把刀刃已收起的舊美工刀，可以割開封箱膠帶。',
  },
  firefighterGear: {
    image: publicUrl('assets/inventory-icons/firefighter-gear-v1.png'),
    description: '一套摺好的消防衣褲和頭盔，表面殘留著煙灰。',
  },
  firefighterMask: {
    image: publicUrl('assets/inventory-icons/firefighter-mask-v1.png'),
    description: '一副舊消防面罩，透明視窗覆著刮痕與煙灰。',
  },
  completeFirefighterGear: {
    image: publicUrl('assets/inventory-icons/firefighter-gear-complete-v1.png'),
    description: '消防衣褲、頭盔與面罩已整理成一套完整的消防裝備。',
  },
};

const couplePhotoImage = publicUrl('assets/room307/photos/男女主角照片.png');
const firefighterAwardsImage = publicUrl('assets/room307/photos/祈彥殉職褒揚狀-v1.png');
const awardPreviewClasses: Record<AwardPreviewId, string> = {
  firefighterAward: 'award-one-preview',
};
const storyPhotoDetails: Record<StoryPhotoId, {
  label: string;
  image: string;
  ratio: string;
  description: string;
}> = {
  familyPhoto: {
    label: '童年家庭照',
    image: publicUrl('assets/room307/photos/男主童年家庭照.png'),
    ratio: '1397 / 1126',
    description: '照片裡，年幼的主角被父母護在中間。父親穿著消防制服。',
  },
  firefighterPhoto: {
    label: '火場照片',
    image: publicUrl('assets/room307/photos/消防員走向火場.png'),
    ratio: '1397 / 1340',
    description: '一名消防員背對鏡頭走向火場，手裡握著錄音吊飾。',
  },
  girlfriendPhoto: {
    label: '搬家那天的照片',
    image: publicUrl('assets/room307/photos/女友搬家生活照.png'),
    ratio: '1397 / 1126',
    description: '女友累得倒在床上，身旁還堆著沒有拆完的紙箱。',
  },
};

const DESK_DRAWER_INSPECT_IMAGES = {
  closed: publicUrl('assets/room307/photos/drawer-closed-closeup.png'),
  opened: publicUrl('assets/room307/props/open-drawer-realistic.png'),
} as const;

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
const genericItemPanelEl = document.querySelector<HTMLElement>('#generic-item-panel')!;
const genericItemPreviewImage =
  document.querySelector<HTMLImageElement>('#generic-item-image')!;
const genericItemNameEl = document.querySelector<HTMLElement>('#generic-item-name')!;
const genericItemDescriptionEl =
  document.querySelector<HTMLElement>('#generic-item-description')!;
const safeInspectEl = document.querySelector<HTMLElement>('#safe-inspect')!;
const safeInspectImageEl = document.querySelector<HTMLImageElement>('#safe-inspect-image')!;
const safeKeyHotspotEl = document.querySelector<HTMLElement>('#safe-key-hotspot')!;
const safePendantHotspotEl = document.querySelector<HTMLElement>('#safe-pendant-hotspot')!;
const safePhotoHotspotEl = document.querySelector<HTMLElement>('#safe-photo-hotspot')!;
const photoInspectEl = document.querySelector<HTMLElement>('#photo-inspect')!;
const photoCardEl = document.querySelector<HTMLButtonElement>('#photo-card')!;
const photoFrontImageEl = document.querySelector<HTMLImageElement>('#photo-front img')!;
const photoFrameOverlayEl = document.querySelector<HTMLImageElement>('#photo-frame-overlay')!;
photoFrameOverlayEl.src = publicUrl('assets/room307/props/photo-frame-aged-walnut-v1.png');
const deskDrawerInspectEl = document.querySelector<HTMLElement>('#desk-drawer-inspect')!;
const deskDrawerInspectImageEl =
  document.querySelector<HTMLImageElement>('#desk-drawer-inspect-image')!;
const deskDrawerDoorHotspotEl =
  document.querySelector<HTMLButtonElement>('#desk-drawer-door-hotspot')!;
const drawerTapeLayerEl = document.querySelector<HTMLImageElement>('#drawer-tape-layer')!;
const drawerBatteryLayerEl = document.querySelector<HTMLImageElement>('#drawer-battery-layer')!;
const drawerBoxCutterLayerEl = document.querySelector<HTMLImageElement>('#drawer-box-cutter-layer')!;
const drawerTapeHotspotEl = document.querySelector<HTMLButtonElement>('#drawer-tape-hotspot')!;
const drawerBatteryHotspotEl = document.querySelector<HTMLButtonElement>('#drawer-battery-hotspot')!;
const drawerBoxCutterHotspotEl =
  document.querySelector<HTMLButtonElement>('#drawer-box-cutter-hotspot')!;
const cardboardBoxInspectEl = document.querySelector<HTMLElement>('#cardboard-box-inspect')!;
const cardboardBoxInspectImageEl =
  document.querySelector<HTMLImageElement>('#cardboard-box-inspect-image')!;
const cardboardBoxOpenHotspotEl =
  document.querySelector<HTMLButtonElement>('#cardboard-box-open-hotspot')!;
const cardboardBoxGearHotspotEl =
  document.querySelector<HTMLButtonElement>('#cardboard-box-gear-hotspot')!;
const cardboardBoxCutProgressEl =
  document.querySelector<HTMLElement>('#cardboard-box-cut-progress')!;
const cardboardBoxCutToolEl =
  document.querySelector<HTMLImageElement>('#cardboard-box-cut-tool')!;
const bedInspectEl = document.querySelector<HTMLElement>('#bed-inspect')!;
const bedInspectImageEl = document.querySelector<HTMLImageElement>('#bed-inspect-image')!;
const bedScareVideoEl = document.querySelector<HTMLVideoElement>('#bed-scare-video')!;
const bedStruggleVideoEl = document.querySelector<HTMLVideoElement>('#bed-struggle-video')!;
const bedDeathVideoEl = document.querySelector<HTMLVideoElement>('#bed-death-video')!;
const bedInspectFrameEl = document.querySelector<HTMLElement>('#bed-inspect-frame')!;
const bedEscapeProgressEl = document.querySelector<HTMLElement>('#bed-escape-progress')!;
const bedEscapeCountdownEl = document.querySelector<HTMLElement>('#bed-escape-countdown')!;
const bedDeathMenuEl = document.querySelector<HTMLElement>('#bed-death-menu')!;
const bedAntennaHotspotEl = document.querySelector<HTMLButtonElement>('#bed-antenna-hotspot')!;
const radioInspectEl = document.querySelector<HTMLElement>('#radio-inspect')!;
const radioInspectImageEl = document.querySelector<HTMLImageElement>('#radio-inspect-image')!;
const drawerPuzzleEl = document.querySelector<HTMLElement>('#drawer-puzzle')!;
const drawerLockEl = document.querySelector<HTMLElement>('#drawer-lock')!;
const drawerCodeDisplayEl = document.querySelector<HTMLOutputElement>('#drawer-code-display')!;
const drawerCodeSlotEls = Array.from(
  drawerCodeDisplayEl.querySelectorAll<HTMLElement>('.drawer-code-slot'),
);
const quickSlotEl = document.querySelector<HTMLElement>('#quick-slot')!;
const quickSlotLabelEl = document.querySelector<HTMLElement>('#quick-slot-label')!;
const roomScene = document.querySelector<HTMLElement>('#room-scene')!;
const chapterCompleteEl = document.querySelector<HTMLElement>('#chapter-complete')!;
const room = new PrototypeRoom2D(roomScene);

const locationParams = new URLSearchParams(location.search);
const resumedAfterBedDeath = locationParams.get('restart') === 'death';
const roomCode =
  normalizeRoomCode(locationParams.get('room')) ??
  normalizeRoomCode(sessionStorage.getItem('corner-horror-prototype-room')) ??
  createRoomCode();
sessionStorage.setItem('corner-horror-prototype-room', roomCode);
if (resumedAfterBedDeath) overlayEl.classList.add('hidden');

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectEnabled = true;
let pointer = { x: 0, y: 0 };
let pointerTarget = { x: 0, y: 0 };
let move = { x: 0, y: 0 };
let target: HTMLElement | null = null;
let roomTarget: RoomObjectId | null = null;
let noticeTimer: ReturnType<typeof setTimeout> | null = null;
let inventoryOpen = false;
let safeInspectOpen = false;
let photoInspectOpen = false;
let photoFlipped = false;
let storyPhotoPreview: StoryPhotoId | null = null;
let staticWallPreview = false;
let deskDrawerInspectOpen = false;
let cardboardBoxInspectOpen = false;
let cardboardBoxOpened = false;
let cardboardBoxCutGesture: HorizontalCutGesture | null = null;
let cardboardBoxCutFeedbackStep = 0;
let bedInspectOpen = false;
let radioInspectOpen = false;
let drawerPuzzleOpen = false;
let safeUnlocked = false;
let drawerCode = '';
let safeCodeFailures = 0;
let selectedItem: ItemId | null = null;
let detailItem: ItemId | null = null;
let photoClueRead = false;
let photoMemoryActive = false;
let pendantActivated = false;
let pendantPowered = false;
let deskDrawerUnlocked = false;
let deskDrawerOpened = false;
let deskDrawerOpening = false;
let pendantHoldTimer: number | null = null;
let bedGrabActive = false;
type BedEventPhase =
  | 'idle'
  | 'reach'
  | 'grab-transition'
  | 'struggle'
  | 'branching'
  | 'success'
  | 'death-transition'
  | 'death'
  | 'death-hold'
  | 'death-menu'
  | 'closed'
  | 'resetting';
let bedEventPhase: BedEventPhase = 'idle';
let bedShakeScore = 0;
let bedShakeFeedbackStep = 0;
let bedDeathMenuTimer: number | null = null;
let bedPlayerScreamStarted = false;
let bedReachCutFrame: number | null = null;
let tapePlayed = false;
let antennaInstalled = false;
let radioBroadcastHeard = false;
let tapePlaybackActive = false;
let doorUnlockAnnounced = false;
let doorScarePlayed = false;
let chapterCompleted = false;
let interactionHeld = false;
let hostAudioContext: AudioContext | null = null;
let hostAudioMuted = false;
const ambienceAudio = document.querySelector<HTMLAudioElement>('#ambient-audio')!;
const bedReachAudio = document.querySelector<HTMLAudioElement>('#bed-reach-audio')!;
const bedStruggleAudio = document.querySelector<HTMLAudioElement>('#bed-struggle-audio')!;
const bedDeathAudio = document.querySelector<HTMLAudioElement>('#bed-death-audio')!;
const bedPlayerScreamAudio = document.querySelector<HTMLAudioElement>(
  '#bed-player-scream-audio',
)!;
ambienceAudio.volume = 0.26;
ambienceAudio.loop = true;
bedReachAudio.volume = BED_AUDIO_CUES.monsterVoiceVolume;
bedReachAudio.loop = true;
bedStruggleAudio.volume = BED_AUDIO_CUES.monsterAppearanceVolume;
bedStruggleAudio.loop = true;
bedDeathAudio.volume = BED_AUDIO_CUES.monsterDeathVolume;
bedDeathAudio.loop = BED_AUDIO_CUES.monsterDeathLoop;
bedPlayerScreamAudio.volume = BED_AUDIO_CUES.playerScreamVolume;
type HostSoundId =
  | 'keypad'
  | 'keypadUnlock'
  | 'keypadError'
  | 'keypadReset'
  | 'footsteps'
  | 'doorImpact'
  | 'wardrobeCreak'
  | 'jumpscare'
  | 'pendantMelody'
  | 'radioBroadcast'
  | 'tapeGirlfriendIntro'
  | 'tapeGirlfriendReply'
  | 'tapeGirlfriendDistortedTail';
const hostSoundUrls: Record<HostSoundId, string> = {
  keypad: publicUrl('assets/audio/password-keypad.mp3'),
  keypadUnlock: publicUrl('assets/audio/password-unlock.mp3'),
  keypadError: publicUrl('assets/audio/password-error.mp3'),
  keypadReset: publicUrl('assets/audio/password-reset.mp3'),
  footsteps: publicUrl('assets/audio/player-walking.mp3'),
  doorImpact: publicUrl('assets/audio/cinematic-deep-impact.mp3'),
  wardrobeCreak: publicUrl('assets/audio/scary-door-opening.mp3'),
  jumpscare: publicUrl('assets/audio/jumpscare-scream.mp3'),
  pendantMelody: publicUrl('assets/audio/pendant-melody.mp3'),
  radioBroadcast: publicUrl('assets/audio/radio_broadcast_01.wav'),
  tapeGirlfriendIntro: publicUrl('assets/audio/voice/tape-girlfriend-01.m4a'),
  tapeGirlfriendReply: publicUrl('assets/audio/voice/tape-girlfriend-02.m4a'),
  tapeGirlfriendDistortedTail: publicUrl(
    'assets/audio/voice/tape-girlfriend-distorted-tail.m4a',
  ),
};
const tapeVoiceSoundIds: Record<TapeVoiceClipId, HostSoundId> = {
  girlfriendIntro: 'tapeGirlfriendIntro',
  girlfriendReply: 'tapeGirlfriendReply',
  girlfriendDistortedTail: 'tapeGirlfriendDistortedTail',
};
const hostAudioBuffers = new Map<HostSoundId, AudioBuffer>();
let hostAudioLoadPromise: Promise<void> | null = null;
let footstepSource: AudioBufferSourceNode | null = null;
let footstepGain: GainNode | null = null;
let footstepStopTimer: ReturnType<typeof setTimeout> | null = null;
let tapeNoiseSource: AudioBufferSourceNode | null = null;
let tapeNoiseGain: GainNode | null = null;
let cardboardBoxCutSoundAt = 0;
let radioFlickerTimer: number | null = null;
const inventorySlots: Array<ItemId | null> = Array.from({ length: 12 }, () => null);
const collectedItems = new Set<ItemId>();
const SAFE_INSPECT_IMAGES = {
  closed: publicUrl('assets/room307/photos/密碼鎖.png'),
  empty: publicUrl('assets/room307/photos/safe-open-user-empty.png'),
} as const;
const RADIO_INSPECT_IMAGES = {
  empty: publicUrl('assets/room307/photos/recorder-closeup-empty.png'),
  antenna: publicUrl('assets/room307/photos/recorder-closeup-antenna.png'),
  tape: publicUrl('assets/room307/photos/recorder-closeup-tape.png'),
  complete: publicUrl('assets/room307/photos/recorder-closeup-complete.png'),
} as const;
const CARDBOARD_BOX_INSPECT_IMAGES = {
  closed: publicUrl('assets/room307/photos/cardboard-box-closeup-closed-v2-topdown.png'),
  opened: publicUrl('assets/room307/photos/cardboard-box-closeup-open-gear-v3-topdown.png'),
} as const;
const BED_REACH_CUT_AT = 6.3;
const BED_STRUGGLE_START_AT = 0.88;
const BED_STRUGGLE_BRANCH_AT = 3.68;
const BED_DEATH_START_AT = 2.02;
const BED_STRUGGLE_PLAYBACK_RATE = 0.72;
const BED_BRANCH_ANCHOR_MS = 140;
const bedEventVideos = [bedScareVideoEl, bedStruggleVideoEl, bedDeathVideoEl];
[
  ...Object.values(SAFE_INSPECT_IMAGES),
  ...Object.values(RADIO_INSPECT_IMAGES),
  ...Object.values(CARDBOARD_BOX_INSPECT_IMAGES),
].forEach((src) => {
  const preload = new Image();
  preload.src = src;
});

function send(payload: unknown): void {
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(payload));
}

function setStatus(text: string): void {
  statusEl.textContent = text;
}

function clearNotice(): void {
  noticeEl.textContent = '';
  noticeEl.classList.remove('show');
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = null;
}

function showNotice(text: string, duration = 2400): void {
  clearNotice();
  noticeEl.textContent = text;
  noticeEl.classList.add('show');
  noticeTimer = setTimeout(() => noticeEl.classList.remove('show'), duration);
}

function showRecorderSubtitle(text: string, duration = 2400): void {
  noticeEl.textContent = text;
  noticeEl.classList.add('show');
  if (noticeTimer) clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => noticeEl.classList.remove('show'), duration);
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
  resumeActiveBedEventAudio();
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

function playCardboardCutSound(progress: number): void {
  const now = performance.now();
  if (hostAudioMuted || now - cardboardBoxCutSoundAt < 58) return;
  const context = ensureHostAudioContext();
  if (!context || context.state !== 'running') return;
  cardboardBoxCutSoundAt = now;

  const duration = 0.11;
  const frameCount = Math.ceil(context.sampleRate * duration);
  const buffer = context.createBuffer(1, frameCount, context.sampleRate);
  const data = buffer.getChannelData(0);
  for (let index = 0; index < frameCount; index += 1) {
    const envelope = 1 - index / frameCount;
    const grain = Math.random() * 2 - 1;
    const rasp = Math.sin(index * (0.33 + progress * 0.08)) * 0.24;
    data[index] = (grain * 0.78 + rasp) * envelope;
  }

  const source = context.createBufferSource();
  const highpass = context.createBiquadFilter();
  const bandpass = context.createBiquadFilter();
  const gain = context.createGain();
  highpass.type = 'highpass';
  highpass.frequency.value = 320;
  bandpass.type = 'bandpass';
  bandpass.frequency.value = 1050 + progress * 520;
  bandpass.Q.value = 0.72;
  gain.gain.setValueAtTime(0.055, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  source.buffer = buffer;
  source.connect(highpass);
  highpass.connect(bandpass);
  bandpass.connect(gain);
  gain.connect(context.destination);
  source.start();
  source.stop(context.currentTime + duration);
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

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function fadeMediaVolume(
  media: HTMLMediaElement,
  targetVolume: number,
  durationMilliseconds: number,
): Promise<void> {
  const startVolume = media.volume;
  const safeTarget = Math.max(0, Math.min(1, targetVolume));
  if (durationMilliseconds <= 0 || Math.abs(startVolume - safeTarget) < 0.001) {
    media.volume = safeTarget;
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const startedAt = performance.now();
    const update = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / durationMilliseconds);
      const easedProgress = progress * progress * (3 - 2 * progress);
      media.volume = startVolume + (safeTarget - startVolume) * easedProgress;
      if (progress < 1) requestAnimationFrame(update);
      else resolve();
    };
    requestAnimationFrame(update);
  });
}

function startTapeNoise(): void {
  if (hostAudioMuted || tapeNoiseSource) return;
  const context = ensureHostAudioContext();
  if (!context || context.state !== 'running') return;

  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let index = 0; index < samples.length; index += 1) {
    samples[index] = (Math.random() * 2 - 1) * 0.42;
  }

  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = true;
  filter.type = 'bandpass';
  filter.frequency.value = 3100;
  filter.Q.value = 0.55;
  const now = context.currentTime;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(0.01, now + 0.9);
  source.connect(filter).connect(gain).connect(context.destination);
  source.start();
  tapeNoiseSource = source;
  tapeNoiseGain = gain;
}

function stopTapeNoise(): void {
  const context = hostAudioContext;
  const source = tapeNoiseSource;
  const gain = tapeNoiseGain;
  if (!context || !source || !gain) return;

  tapeNoiseSource = null;
  tapeNoiseGain = null;
  const now = context.currentTime;
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
  source.stop(now + 0.25);
}

function setTapeNoiseLevel(level: number, fadeSeconds = 0.08): void {
  const context = hostAudioContext;
  const gain = tapeNoiseGain;
  if (!context || !gain) return;

  const now = context.currentTime;
  gain.gain.cancelScheduledValues(now);
  gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), now);
  gain.gain.linearRampToValueAtTime(level, now + fadeSeconds);
}

function checkChapterExit(): void {
  if (
    doorUnlockAnnounced ||
    !canUnlockRoomDoor({
      safeUnlocked,
      photoMounted: room.hasMountedCouplePhoto(),
      tapePlayed,
      pendantActivated,
      radioBroadcastHeard,
    })
  ) {
    return;
  }

  doorUnlockAnnounced = true;
  window.setTimeout(() => {
    void playHostSound('keypadUnlock', { volume: 0.42, playbackRate: 0.72 });
    showNotice('房門的鎖打開了。', 3200);
    vibrate([70, 90, 120]);
  }, 700);
}

async function playTapeRecording(): Promise<void> {
  if (tapePlaybackActive) return;
  tapePlaybackActive = true;
  move = { x: 0, y: 0 };
  stopFootsteps();
  document.body.classList.add('tape-playing');
  const previousAmbientVolume = ambienceAudio.volume;
  const ambientFadeOut = fadeMediaVolume(
    ambienceAudio,
    Math.min(previousAmbientVolume, 0.03),
    1500,
  );

  try {
    await playHostSound('keypadReset', { volume: 0.28, playbackRate: 0.72 });
    startTapeNoise();
    showNotice('錄音機開始播放。', 1900);
    await Promise.all([wait(1900), ambientFadeOut]);

    for (const line of tapeRecordingLines) {
      if (line.distorted) {
        setTapeNoiseLevel(0.11, 1.6);
        vibrate([55, 70, 120]);
        document.body.classList.add('tape-distorted');
        await wait(420);
      }
      if (line.clip) {
        void playHostSound(tapeVoiceSoundIds[line.clip], {
          volume: line.distorted ? 0.9 : 2.75,
        });
      }
      showRecorderSubtitle(`${line.source}：${line.text}`, line.duration);
      await wait(line.duration);
      if (line.distorted) setTapeNoiseLevel(0.01, 1.2);
    }

    tapePlayed = true;
  } finally {
    stopTapeNoise();
    document.body.classList.remove('tape-playing', 'tape-distorted');
    await fadeMediaVolume(ambienceAudio, previousAmbientVolume, 1800);
    tapePlaybackActive = false;
    checkChapterExit();
  }
}

function applyRadioFlicker(
  brightness: number,
  contrast: number,
  flashAlpha: number,
  transitionMs: number,
): void {
  document.body.style.setProperty('--radio-brightness', brightness.toFixed(2));
  document.body.style.setProperty('--radio-contrast', contrast.toFixed(2));
  document.body.style.setProperty('--radio-flash-alpha', flashAlpha.toFixed(2));
  document.body.style.setProperty('--radio-flicker-transition', `${transitionMs}ms`);
}

function scheduleRadioFlicker(): void {
  if (!document.body.classList.contains('radio-broadcast-playing')) return;

  const roll = Math.random();
  let delay: number;
  if (roll < 0.14) {
    applyRadioFlicker(0.5 + Math.random() * 0.2, 1.12, 0, 28);
    delay = 45 + Math.random() * 90;
  } else if (roll < 0.25) {
    applyRadioFlicker(1.28 + Math.random() * 0.32, 1.08, 0.12 + Math.random() * 0.14, 22);
    delay = 35 + Math.random() * 75;
  } else {
    applyRadioFlicker(0.9 + Math.random() * 0.16, 1.01, 0, 65 + Math.random() * 85);
    delay = 160 + Math.random() * 620;
  }

  radioFlickerTimer = window.setTimeout(scheduleRadioFlicker, delay);
}

function startRadioFlicker(): void {
  if (radioFlickerTimer) window.clearTimeout(radioFlickerTimer);
  applyRadioFlicker(0.96, 1.02, 0, 60);
  radioFlickerTimer = window.setTimeout(scheduleRadioFlicker, 90 + Math.random() * 220);
}

function stopRadioFlicker(): void {
  if (radioFlickerTimer) window.clearTimeout(radioFlickerTimer);
  radioFlickerTimer = null;
  document.body.style.removeProperty('--radio-brightness');
  document.body.style.removeProperty('--radio-contrast');
  document.body.style.removeProperty('--radio-flash-alpha');
  document.body.style.removeProperty('--radio-flicker-transition');
}

async function playRadioBroadcast(): Promise<void> {
  if (tapePlaybackActive || radioBroadcastHeard) return;
  tapePlaybackActive = true;
  move = { x: 0, y: 0 };
  stopFootsteps();
  document.body.classList.add('radio-broadcast-playing');
  startRadioFlicker();
  const previousAmbientVolume = ambienceAudio.volume;
  await fadeMediaVolume(ambienceAudio, Math.min(previousAmbientVolume, 0.05), 1200);

  try {
    showNotice('收錄音機傳出斷續雜訊。', 2200);
    await playHostSound('radioBroadcast', { volume: 0.86 });
    const duration = hostAudioBuffers.get('radioBroadcast')?.duration ?? 16.1;
    await wait(duration * 1000);
    radioBroadcastHeard = true;
  } finally {
    stopRadioFlicker();
    document.body.classList.remove('radio-broadcast-playing');
    await fadeMediaVolume(ambienceAudio, previousAmbientVolume, 1600);
    tapePlaybackActive = false;
    checkChapterExit();
  }
}

async function playDoorScare(): Promise<void> {
  if (doorScarePlayed) {
    showNotice('房門打不開。', 2200);
    void playHeavyDoorKnocks();
    return;
  }
  doorScarePlayed = true;
  showNotice('房門打不開。', 2200);
  void playHostSound('footsteps', { volume: 0.52, playbackRate: 1.16 });
  await wait(650);
  void playHeavyDoorKnocks();
  await wait(1750);
  void playHostSound('jumpscare', { volume: 0.92 });
  showNotice('門外人聲：啊啊啊啊啊！！！！！', 2600);
}

async function playHeavyDoorKnocks(): Promise<void> {
  void playHostSound('doorImpact', { volume: 0.72, playbackRate: 0.66 });
  void playHostSound('doorImpact', { volume: 0.78, playbackRate: 0.62, delay: 0.48 });
  void playHostSound('doorImpact', { volume: 0.92, playbackRate: 0.58, delay: 0.98 });
  vibrate([150, 180, 170, 180, 230]);
  showNotice('房門傳來猛烈撞擊。', 1800);
}

async function playBedAntennaScare(): Promise<void> {
  if (bedGrabActive) return;
  if (bedDeathMenuTimer !== null) {
    window.clearTimeout(bedDeathMenuTimer);
    bedDeathMenuTimer = null;
  }
  bedDeathMenuEl.classList.remove('show', 'closed');
  bedGrabActive = true;
  bedEventPhase = 'reach';
  bedShakeScore = 0;
  bedShakeFeedbackStep = 0;
  bedAntennaHotspotEl.hidden = true;
  stopBedDeathAudio();
  if (bedReachAudio.paused && !hostAudioMuted) {
    if (bedReachAudio.currentTime < BED_AUDIO_CUES.monsterVoiceStartAt) {
      bedReachAudio.currentTime = BED_AUDIO_CUES.monsterVoiceStartAt;
    }
    void bedReachAudio.play().catch(() => undefined);
  }
  bedScareVideoEl.currentTime = 0;
  bedScareVideoEl.playbackRate = 1;
  bedScareVideoEl.volume = 0.92;
  setActiveBedVideo(bedScareVideoEl);
  bedInspectEl.classList.add('playing-scare');
  document.body.classList.add('bed-grab-active');
  try {
    await bedScareVideoEl.play();
    monitorBedReachCut();
  } catch {
    void startBedStruggle();
  }
}

function stopBedReachCutMonitor(): void {
  if (bedReachCutFrame === null) return;
  cancelAnimationFrame(bedReachCutFrame);
  bedReachCutFrame = null;
}

function monitorBedReachCut(): void {
  stopBedReachCutMonitor();
  const checkFrame = () => {
    if (!bedGrabActive || bedEventPhase !== 'reach') {
      bedReachCutFrame = null;
      return;
    }
    if (bedScareVideoEl.currentTime >= BED_REACH_CUT_AT) {
      bedScareVideoEl.pause();
      bedReachCutFrame = null;
      void startBedStruggle();
      return;
    }
    bedReachCutFrame = requestAnimationFrame(checkFrame);
  };
  bedReachCutFrame = requestAnimationFrame(checkFrame);
}

function seekBedVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      video.removeEventListener('seeked', finish);
      video.removeEventListener('loadedmetadata', applySeek);
      resolve();
    };
    const applySeek = () => {
      try {
        video.currentTime = time;
      } catch {
        finish();
      }
    };
    const timeout = window.setTimeout(finish, 800);
    video.addEventListener('seeked', finish, { once: true });
    if (video.readyState === 0) {
      video.addEventListener('loadedmetadata', applySeek, { once: true });
    } else {
      applySeek();
    }
  });
}

function setActiveBedVideo(activeVideo: HTMLVideoElement | null): void {
  bedEventVideos.forEach((video) => {
    video.classList.toggle('is-playing', video === activeVideo);
    if (video !== activeVideo) video.pause();
  });
}

function resetBedVideos(): void {
  stopBedReachCutMonitor();
  bedEventVideos.forEach((video) => {
    video.pause();
    video.currentTime = 0;
    video.playbackRate = 1;
    video.classList.remove('is-playing');
  });
}

function startBedInspectAudio(): void {
  if (collectedItems.has('antenna')) return;
  if (bedReachAudio.currentTime < BED_AUDIO_CUES.monsterVoiceStartAt) {
    bedReachAudio.currentTime = BED_AUDIO_CUES.monsterVoiceStartAt;
  }
  if (!hostAudioMuted && bedReachAudio.paused) {
    void bedReachAudio.play().catch(() => undefined);
  }
}

function stopBedStruggleAudio(): void {
  bedStruggleAudio.pause();
  bedStruggleAudio.currentTime = 0;
}

function stopBedDeathAudio(): void {
  bedPlayerScreamStarted = false;
  bedDeathAudio.pause();
  bedDeathAudio.currentTime = 0;
  bedPlayerScreamAudio.pause();
  bedPlayerScreamAudio.currentTime = 0;
}

function playBedDeathAudio(): void {
  stopBedDeathAudio();
  if (hostAudioMuted) return;
  void bedDeathAudio.play().catch(() => undefined);
}

function syncBedPlayerScreamToVideo(): void {
  if (bedEventPhase !== 'death') return;
  bedDeathVideoEl.playbackRate = bedDeathPlaybackRate(bedDeathVideoEl.currentTime);
  if (hostAudioMuted) return;
  if (bedPlayerScreamStarted) {
    if (bedPlayerScreamAudio.paused && !bedPlayerScreamAudio.ended) {
      void bedPlayerScreamAudio.play().catch(() => undefined);
    }
    return;
  }
  if (!shouldStartBedPlayerScream(bedDeathVideoEl.currentTime, bedPlayerScreamStarted)) return;
  bedPlayerScreamStarted = true;
  bedPlayerScreamAudio.currentTime = 0;
  void bedPlayerScreamAudio.play().catch(() => undefined);
}

function stopBedReachAudio(): void {
  bedReachAudio.pause();
  bedReachAudio.currentTime = 0;
}

function resumeActiveBedEventAudio(): void {
  if (hostAudioMuted) return;
  if (
    (bedEventPhase === 'reach' ||
      (bedEventPhase === 'idle' && bedInspectOpen && !collectedItems.has('antenna'))) &&
    bedReachAudio.paused
  ) {
    void bedReachAudio.play().catch(() => undefined);
  }
  if (
    bedEventPhase === 'struggle' &&
    bedStruggleAudio.paused
  ) {
    void bedStruggleAudio.play().catch(() => undefined);
  }
  if (bedEventPhase === 'death' && bedDeathAudio.paused) {
    void bedDeathAudio.play().catch(() => undefined);
  }
  if (bedEventPhase === 'death') syncBedPlayerScreamToVideo();
}

function resetBedEscapeFeedback(): void {
  bedInspectEl.classList.remove('struggling');
  bedInspectFrameEl.classList.remove('bed-shake-feedback');
  bedEscapeProgressEl.style.width = '0%';
  bedEscapeCountdownEl.textContent = '在 4.0 秒內掙脫鬼手';
}

function pulseBedStruggleFeedback(intensity: number): void {
  const strength = 0.55 + Math.max(0, Math.min(1, intensity)) * 0.95;
  bedInspectFrameEl.style.setProperty('--bed-shake-x', `${strength}%`);
  bedInspectFrameEl.style.setProperty('--bed-shake-y', `${strength * 0.64}%`);
  bedInspectFrameEl.style.setProperty('--bed-shake-angle', `${strength * 0.36}deg`);
  bedInspectFrameEl.classList.remove('bed-shake-feedback');
  void bedInspectFrameEl.offsetWidth;
  bedInspectFrameEl.classList.add('bed-shake-feedback');
}

async function startBedStruggle(): Promise<void> {
  if (!bedGrabActive || bedEventPhase !== 'reach') return;
  bedEventPhase = 'grab-transition';
  stopBedReachCutMonitor();
  bedScareVideoEl.pause();
  stopBedReachAudio();
  bedShakeScore = 0;
  bedShakeFeedbackStep = 0;
  await seekBedVideo(bedStruggleVideoEl, BED_STRUGGLE_START_AT);
  if (!bedGrabActive || bedEventPhase !== 'grab-transition') return;
  bedEventPhase = 'struggle';
  bedStruggleVideoEl.playbackRate = BED_STRUGGLE_PLAYBACK_RATE;
  bedStruggleVideoEl.volume = 0.92;
  setActiveBedVideo(bedStruggleVideoEl);
  bedInspectEl.classList.add('struggling');
  bedEscapeProgressEl.style.width = '0%';
  bedEscapeCountdownEl.textContent = '在 4.0 秒內掙脫鬼手';
  bedStruggleAudio.currentTime = 0;
  void bedStruggleAudio.play().catch(() => undefined);
  vibrate([260, 45, 260, 45, 360]);
  try {
    await bedStruggleVideoEl.play();
  } catch {
    void startBedDeath();
  }
}

function registerBedShake(intensity: number): void {
  if (!bedGrabActive || bedEventPhase !== 'struggle') return;
  bedShakeScore = addBedShakeProgress(bedShakeScore, intensity);
  const normalizedProgress = Math.min(1, bedShakeScore / BED_SHAKE_TARGET);
  bedEscapeProgressEl.style.width = `${normalizedProgress * 100}%`;
  pulseBedStruggleFeedback(intensity);
  const feedbackStep = Math.min(4, Math.floor((bedShakeScore / BED_SHAKE_TARGET) * 4));
  if (feedbackStep <= bedShakeFeedbackStep) return;
  bedShakeFeedbackStep = feedbackStep;
  vibrate(feedbackStep === 4 ? [80, 35, 150] : 45 + feedbackStep * 15);
}

function finishBedGrabSuccess(): void {
  if (!bedGrabActive) return;
  bedGrabActive = false;
  bedEventPhase = 'idle';
  resetBedVideos();
  stopBedReachAudio();
  stopBedStruggleAudio();
  stopBedDeathAudio();
  resetBedEscapeFeedback();
  bedInspectEl.classList.remove('playing-scare');
  document.body.classList.remove('bed-grab-active');
  document.body.classList.add('bed-grab-released');
  window.setTimeout(() => document.body.classList.remove('bed-grab-released'), 1900);
  if (addItem('antenna')) room.collectObject('antenna');
  renderBedInspect();
  vibrate([360, 90, 110]);
}

async function startBedDeath(): Promise<void> {
  if (
    !bedGrabActive ||
    (bedEventPhase !== 'struggle' && bedEventPhase !== 'branching')
  ) return;
  bedEventPhase = 'death-transition';
  stopBedStruggleAudio();
  resetBedEscapeFeedback();
  await Promise.all([
    seekBedVideo(bedDeathVideoEl, BED_DEATH_START_AT),
    new Promise<void>((resolve) => window.setTimeout(resolve, BED_BRANCH_ANCHOR_MS)),
  ]);
  if (!bedGrabActive || bedEventPhase !== 'death-transition') return;
  bedEventPhase = 'death';
  bedDeathVideoEl.playbackRate = BED_AUDIO_CUES.deathAttackPlaybackRate;
  bedDeathVideoEl.volume = 1;
  setActiveBedVideo(bedDeathVideoEl);
  playBedDeathAudio();
  vibrate([520, 70, 720]);
  try {
    await bedDeathVideoEl.play();
  } catch {
    finishBedDeath();
  }
}

async function restartGameAfterBedDeath(): Promise<void> {
  if (bedEventPhase !== 'death-menu') return;
  bedEventPhase = 'resetting';
  clearBedDeathInventory(inventorySlots);
  collectedItems.clear();
  selectedItem = null;
  detailItem = null;
  inventoryOpen = false;
  bedInspectOpen = false;
  interactionHeld = false;
  move = { x: 0, y: 0 };
  syncControllerState();
  await wait(120);
  try {
    await clearSave();
  } finally {
    sessionStorage.setItem('corner-horror-prototype-room', roomCode);
    location.replace(buildBedDeathRestartUrl(location.href, roomCode));
  }
}

async function closeGameAfterBedDeath(): Promise<void> {
  if (bedEventPhase !== 'death-menu') return;
  bedEventPhase = 'closed';
  reconnectEnabled = false;
  if (window.room307Desktop) {
    try {
      await window.room307Desktop.closeGame();
      return;
    } catch {
      // Keep the death screen usable if the desktop bridge cannot close the window.
    }
  }
  bedDeathMenuEl.classList.add('closed');
  const heading = bedDeathMenuEl.querySelector<HTMLElement>('strong');
  if (heading) heading.textContent = '遊戲已關閉';
}

function showBedDeathMenu(): void {
  if (!bedGrabActive || bedEventPhase !== 'death-hold') return;
  bedEventPhase = 'death-menu';
  bedDeathMenuEl.classList.add('show');
  updatePointer(pointer.x, pointer.y);
}

function finishBedDeath(): void {
  if (!bedGrabActive || bedEventPhase !== 'death') return;
  bedEventPhase = 'death-hold';
  bedDeathVideoEl.pause();
  stopBedReachAudio();
  stopBedStruggleAudio();
  stopBedDeathAudio();
  resetBedEscapeFeedback();
  if (bedDeathMenuTimer !== null) window.clearTimeout(bedDeathMenuTimer);
  bedDeathMenuTimer = window.setTimeout(() => {
    bedDeathMenuTimer = null;
    showBedDeathMenu();
  }, BED_BLOOD_HOLD_MS);
}

bedScareVideoEl.addEventListener('timeupdate', () => {
  if (
    !bedGrabActive ||
    bedEventPhase !== 'reach' ||
    bedScareVideoEl.currentTime < BED_REACH_CUT_AT
  ) return;
  void startBedStruggle();
});

bedScareVideoEl.addEventListener('ended', () => {
  if (bedGrabActive && bedEventPhase === 'reach') void startBedStruggle();
});

bedScareVideoEl.addEventListener('error', () => {
  if (bedGrabActive && bedEventPhase === 'reach') void startBedStruggle();
});

bedStruggleVideoEl.addEventListener('timeupdate', () => {
  if (bedGrabActive && bedEventPhase === 'struggle') {
    const remainingSeconds = Math.max(
      0,
      (BED_STRUGGLE_BRANCH_AT - bedStruggleVideoEl.currentTime) /
        BED_STRUGGLE_PLAYBACK_RATE,
    );
    bedEscapeCountdownEl.textContent = `在 ${remainingSeconds.toFixed(1)} 秒內掙脫鬼手`;
  }
  if (
    !bedGrabActive ||
    bedEventPhase !== 'struggle' ||
    bedStruggleVideoEl.currentTime < BED_STRUGGLE_BRANCH_AT
  ) return;
  bedStruggleVideoEl.pause();
  bedEventPhase = 'branching';
  if (hasEscapedBedGrab(bedShakeScore)) {
    window.setTimeout(() => {
      if (!bedGrabActive || bedEventPhase !== 'branching') return;
      bedEventPhase = 'success';
      bedStruggleVideoEl.playbackRate = 1;
      vibrate([100, 35, 180]);
      void bedStruggleVideoEl.play().catch(finishBedGrabSuccess);
    }, BED_BRANCH_ANCHOR_MS);
    return;
  }
  void startBedDeath();
});

bedStruggleVideoEl.addEventListener('ended', () => {
  if (!bedGrabActive) return;
  if (bedEventPhase === 'struggle') {
    if (hasEscapedBedGrab(bedShakeScore)) {
      bedEventPhase = 'success';
      finishBedGrabSuccess();
    } else {
      void startBedDeath();
    }
    return;
  }
  if (bedEventPhase === 'success') finishBedGrabSuccess();
});

bedStruggleVideoEl.addEventListener('error', () => {
  if (!bedGrabActive) return;
  if (bedEventPhase === 'struggle' && !hasEscapedBedGrab(bedShakeScore)) {
    void startBedDeath();
    return;
  }
  finishBedGrabSuccess();
});

bedDeathVideoEl.addEventListener('ended', finishBedDeath);
bedDeathVideoEl.addEventListener('error', finishBedDeath);
bedDeathVideoEl.addEventListener('timeupdate', syncBedPlayerScreamToVideo);
bedDeathMenuEl.addEventListener('click', (event) => {
  const action = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-bed-death-restart], [data-bed-death-close]',
  );
  if (action?.dataset.bedDeathRestart) {
    void restartGameAfterBedDeath();
    return;
  }
  if (action?.dataset.bedDeathClose) void closeGameAfterBedDeath();
});

bedEventVideos.forEach((video) => {
  video.addEventListener('loadedmetadata', () => {
    video.volume = video === bedDeathVideoEl ? 1 : 0.92;
  });
});

function beginPendantHold(): void {
  if (
    pendantActivated ||
    !pendantPowered ||
    pendantHoldTimer !== null ||
    selectedItem !== 'pendant'
  ) return;
  pendantHoldTimer = window.setTimeout(() => {
    pendantHoldTimer = null;
    if (!interactionHeld || selectedItem !== 'pendant') return;
    pendantActivated = true;
    void playHostSound('pendantMelody', { volume: 0.62 });
    showNotice('吊飾響起一段熟悉的旋律。', 4200);
    vibrate([40, 80, 40, 120, 70]);
    checkChapterExit();
    updatePointer(pointer.x, pointer.y);
  }, 780);
}

function cancelPendantHold(): void {
  if (pendantHoldTimer === null) return;
  window.clearTimeout(pendantHoldTimer);
  pendantHoldTimer = null;
}

async function finishChapterOne(): Promise<void> {
  if (chapterCompleted) return;
  chapterCompleted = true;
  move = { x: 0, y: 0 };
  stopFootsteps();
  showNotice('房門緩緩打開。', 1800);
  void playHostSound('doorImpact', { volume: 0.22, playbackRate: 0.48 });
  await wait(900);
  document.body.classList.add('chapter-ending');
  await wait(950);
  chapterCompleteEl.classList.add('show');
  syncControllerState();
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
    bedReachAudio.pause();
    bedStruggleAudio.pause();
    bedDeathAudio.pause();
    bedPlayerScreamAudio.pause();
    stopFootsteps();
    stopTapeNoise();
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
  resumeActiveBedEventAudio();
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

function hasClosableInterfaceOpen(): boolean {
  return inventoryOpen || safeInspectOpen || photoInspectOpen || deskDrawerInspectOpen || cardboardBoxInspectOpen || bedInspectOpen || radioInspectOpen || drawerPuzzleOpen;
}

function isInterfaceOpen(): boolean {
  return hasClosableInterfaceOpen();
}

function syncControllerState(): void {
  send({
    type: 'proto-controller-state',
    inventoryOpen: inventoryOpen || safeInspectOpen || photoInspectOpen || deskDrawerInspectOpen || cardboardBoxInspectOpen || bedInspectOpen || radioInspectOpen || drawerPuzzleOpen,
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
  url.searchParams.set(
    'v',
    import.meta.env.VITE_CONTROLLER_VERSION?.trim() || 'room307-connect-30',
  );
  await QRCode.toCanvas(qrCanvas, url.toString(), {
    width: 300,
    margin: 1,
    errorCorrectionLevel: 'M',
    color: { dark: '#000000', light: '#ffffff' },
  });
  joinUrlEl.textContent = url.toString();
  qrCanvas.style.visibility = 'visible';
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
    void showQr().catch(() => {
      joinUrlEl.textContent = 'QR Code 產生失敗，正在重試。';
    });
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
      }
      if (msg.controller) {
        overlayEl.classList.add('hidden');
        setStatus('手機已連線。請校正中心。');
      } else {
        if (!resumedAfterBedDeath) overlayEl.classList.remove('hidden');
        setStatus('等待手機控制器。');
      }
    }
    if (msg.type === 'ready') {
      overlayEl.classList.add('hidden');
      setStatus('已同步 307。');
    }
    if (shouldRefreshControllerState(msg)) syncControllerState();
    if (msg.type === 'proto-pointer') {
      pointerTarget = { x: msg.x, y: msg.y };
    }
    if (msg.type === 'proto-move') {
      move = { x: msg.x, y: msg.y };
    }
    if (msg.type === 'proto-shake') {
      registerBedShake(msg.intensity);
    }
    if (msg.type === 'proto-navigate') {
      move = { x: 0, y: 0 };
      if (photoMemoryActive) return;
      if (bedGrabActive) {
        return;
      }
      if (msg.direction === 'back' && hasClosableInterfaceOpen()) {
        returnToRoom();
        return;
      }
      room.navigate(msg.direction);
    }
    if (msg.type === 'proto-interact') {
      handleInteract();
    }
    if (msg.type === 'proto-use') {
      interactionHeld = msg.pressed;
      if (interactionHeld) {
        beginPendantHold();
        beginCardboardBoxCut();
      }
      if (!interactionHeld) {
        cancelPendantHold();
        cancelCardboardBoxCut(true);
      }
    }
    if (msg.type === 'proto-item-action') {
      handleItemAction(msg.item, msg.action);
    }
  });

  socket.addEventListener('close', () => {
    if (ws === socket) ws = null;
    interactionHeld = false;
    if (resumedAfterBedDeath) overlayEl.classList.add('hidden');
    else overlayEl.classList.remove('hidden');
    if (!reconnectEnabled) return;
    qrCanvas.style.visibility = 'hidden';
    joinUrlEl.textContent = '正在啟動手機連線服務，請稍候。';
    setStatus('手機連線服務正在重新連接。');
    if (reconnectTimer) return;
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connect();
    }, 1000);
  });
}

function updatePointer(x: number, y: number): void {
  pointer = { x, y };
  const clientX = ((x + 1) / 2) * window.innerWidth;
  const clientY = ((1 - y) / 2) * window.innerHeight;
  const aimX = `${clientX}px`;
  const aimY = `${clientY}px`;
  document.documentElement.style.setProperty('--aim-x', aimX);
  document.documentElement.style.setProperty('--aim-y', aimY);
  if (drawerPuzzleOpen) {
    const bounds = drawerLockEl.getBoundingClientRect();
    drawerLockEl.style.setProperty('--drawer-light-x', `${clientX - bounds.left}px`);
    drawerLockEl.style.setProperty('--drawer-light-y', `${clientY - bounds.top}px`);
  }
  updateTarget();
  updateCardboardBoxCut();
}

function updateTarget(): void {
  if (!isInterfaceOpen()) {
    target = null;
    roomTarget = room.getTargetObject();
    document.querySelectorAll('.active').forEach((element) => element.classList.remove('active'));
    const collectibleLabel = roomTarget === 'receipt'
      ? itemLabels.receipt
      : roomTarget === 'firefighterMask'
        ? itemLabels.firefighterMask
        : null;
    setHoverHint(
      collectibleLabel
        ? `可拿取：${collectibleLabel}`
        : roomTarget
          ? awardLabels[roomTarget] ?? null
          : null,
    );
    return;
  }

  roomTarget = null;
  const clientX = ((pointer.x + 1) / 2) * window.innerWidth;
  const clientY = ((1 - pointer.y) / 2) * window.innerHeight;
  const elements = document.elementsFromPoint(clientX, clientY);
  target = null;
  for (const element of elements) {
    const candidate = element.closest<HTMLElement>(
      '[data-object], [data-inventory-back], [data-safe-back], [data-safe-keypad], [data-safe-item], [data-photo-back], [data-photo-card], [data-desk-drawer-back], [data-desk-drawer-door], [data-desk-drawer-item], [data-cardboard-box-back], [data-cardboard-box-open], [data-cardboard-box-gear], [data-bed-antenna], [data-bed-death-restart], [data-bed-death-close], [data-radio-device], [data-drawer-back], [data-drawer-digit], [data-drawer-clear], [data-drawer-reset], [data-drawer-delete], [data-drawer-submit]',
    );
    if (candidate) {
      target = candidate;
      break;
    }
  }
  document.querySelectorAll('.active').forEach((element) => element.classList.remove('active'));
  target?.classList.add('active');
  const collectibleLabel = collectibleTargetLabel(target);
  setHoverHint(collectibleLabel ? `可拿取：${collectibleLabel}` : null);
}

function setHoverHint(text: string | null): void {
  targetEl.hidden = text === null;
  targetEl.textContent = text ?? '';
}

function collectibleTargetLabel(element: HTMLElement | null): string | null {
  if (!element) return null;
  const safeItem = element.dataset.safeItem;
  if (safeItem === 'photo' || safeItem === 'pendant' || safeItem === 'smallKey') {
    return itemLabels[safeItem];
  }
  const drawerItem = element.dataset.deskDrawerItem;
  if (drawerItem === 'tape' || drawerItem === 'oldBattery' || drawerItem === 'boxCutter') {
    return itemLabels[drawerItem];
  }
  if (element.dataset.cardboardBoxGear && !collectedItems.has('firefighterGear')) {
    return itemLabels.firefighterGear;
  }
  if (element.dataset.bedAntenna && !collectedItems.has('antenna')) {
    return itemLabels.antenna;
  }
  return null;
}

function addItem(item: ItemId): boolean {
  if (collectedItems.has(item)) {
    return false;
  }
  const equipmentMerge = mergeFirefighterEquipmentOnCollect(inventorySlots, item);
  if (equipmentMerge) {
    const previousItem = item === 'firefighterMask' ? 'firefighterGear' : 'firefighterMask';
    inventorySlots.splice(0, inventorySlots.length, ...equipmentMerge.slots);
    collectedItems.add(item);
    collectedItems.add(equipmentMerge.item);
    if (selectedItem === previousItem) selectedItem = equipmentMerge.item;
    if (detailItem === previousItem) detailItem = null;
    void playHostSound('keypadUnlock', { volume: 0.34, playbackRate: 0.82 });
    vibrate([35, 40, 85]);
    syncControllerState();
    return true;
  }
  const emptySlot = inventorySlots.indexOf(null);
  if (emptySlot === -1) {
    return false;
  }
  inventorySlots[emptySlot] = item;
  collectedItems.add(item);
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
  if (tapePlaybackActive || photoMemoryActive || chapterCompleted) return;
  if (drawerPuzzleOpen) {
    handleDrawerInteract();
    return;
  }
  if (photoInspectOpen) {
    handlePhotoInspect();
    return;
  }
  if (deskDrawerInspectOpen) {
    handleDeskDrawerInspect();
    return;
  }
  if (cardboardBoxInspectOpen) {
    handleCardboardBoxInspect();
    return;
  }
  if (bedInspectOpen) {
    handleBedInspect();
    return;
  }
  if (radioInspectOpen) {
    handleRadioInspect();
    return;
  }
  if (safeInspectOpen) {
    handleSafeInspect();
    return;
  }

  if (!inventoryOpen) {
    switch (roomTarget) {
      case 'wardrobeLeft':
        if (room.openWardrobe('left')) {
          clearNotice();
          void playHostSound('wardrobeCreak', { volume: 0.5, playbackRate: 0.92 });
          vibrate([45, 55, 75]);
        } else {
          showNotice('衣櫃左門已經打開了。');
        }
        return;
      case 'wardrobeMiddle':
        if (room.openWardrobe('middle')) {
          clearNotice();
          void playHostSound('wardrobeCreak', { volume: 0.48, playbackRate: 1 });
          vibrate([45, 55, 75]);
        } else {
          showNotice('衣櫃中門已經打開了。');
        }
        return;
      case 'wardrobeRight':
        if (room.openWardrobe('right')) {
          clearNotice();
          void playHostSound('wardrobeCreak', { volume: 0.52, playbackRate: 0.86 });
          vibrate([45, 55, 75]);
        } else {
          showNotice('衣櫃右門已經打開了。');
        }
        return;
      case 'wardrobe':
        showNotice('三扇門可以分別打開。');
        return;
      case 'receipt':
        if (addItem('receipt')) room.collectObject('receipt');
        return;
      case 'photo':
        if (addItem('photo')) room.collectObject('photo');
        return;
      case 'familyPhoto':
      case 'firefighterPhoto':
      case 'girlfriendPhoto':
        openStoryPhotoInspect(roomTarget);
        return;
      case 'firefighterAward':
        openAwardInspect(roomTarget);
        return;
      case 'couplePhotoFrame':
        if (room.hasMountedCouplePhoto()) {
          openPhotoInspect(true);
          return;
        }
        openEmptyFrameInspect();
        return;
      case 'safe':
        openSafeInspect();
        return;
      case 'cardboardBox':
        if (!collectedItems.has('firefighterGear')) openCardboardBoxInspect();
        return;
      case 'firefighterMask':
        if (addItem('firefighterMask')) room.collectObject('firefighterMask');
        return;
      case 'deskDrawer':
        openDeskDrawerInspect();
        return;
      case 'table':
        showNotice('桌上放著一台老舊的收錄音機。');
        return;
      case 'bed':
        openBedInspect();
        return;
      case 'recorder':
        openRadioInspect();
        return;
      case 'door':
        if (!doorUnlockAnnounced) {
          void playDoorScare();
          return;
        }
        void finishChapterOne();
        return;
      default:
        return;
    }
  }

  if (!target) {
    return;
  }
  if (target.dataset.inventoryBack) {
    setInventoryOpen(false);
    return;
  }
}

function playPhotoMemoryReveal(): void {
  if (photoMemoryActive) return;
  photoMemoryActive = true;
  move = { x: 0, y: 0 };
  document.body.classList.add('photo-memory-playing');
  vibrate([55, 110, 80, 160, 120]);
  window.setTimeout(() => {
    showNotice('商禾：放這裡，回家就看得到。', 3600);
  }, 2100);
  window.setTimeout(() => {
    document.body.classList.remove('photo-memory-playing');
    photoMemoryActive = false;
    syncControllerState();
    updatePointer(pointer.x, pointer.y);
  }, 9200);
}

function renderSafeInspect(): void {
  const hasKey = !collectedItems.has('smallKey');
  const hasPendant = !collectedItems.has('pendant');
  const hasPhoto = !collectedItems.has('photo');

  const nextImage = safeUnlocked ? SAFE_INSPECT_IMAGES.empty : SAFE_INSPECT_IMAGES.closed;
  if (safeInspectImageEl.getAttribute('src') !== nextImage) safeInspectImageEl.src = nextImage;

  safeInspectEl.classList.toggle('unlocked', safeUnlocked);
  safeInspectEl.classList.toggle('has-key', safeUnlocked && hasKey);
  safeInspectEl.classList.toggle('has-pendant', safeUnlocked && hasPendant);
  safeInspectEl.classList.toggle('has-photo', safeUnlocked && hasPhoto);
  safeKeyHotspotEl.hidden = !safeUnlocked || !hasKey;
  safePendantHotspotEl.hidden = !safeUnlocked || !hasPendant;
  safePhotoHotspotEl.hidden = !safeUnlocked || !hasPhoto;
}

function openSafeInspect(): void {
  if (inventoryOpen) setInventoryOpen(false);
  safeInspectOpen = true;
  move = { x: 0, y: 0 };
  safeInspectEl.classList.add('open');
  renderSafeInspect();
  showNotice(
    safeUnlocked
      ? '門已經打開了。'
      : '門上裝著四位數字鎖。',
  );
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function closeSafeInspect(): void {
  safeInspectOpen = false;
  move = { x: 0, y: 0 };
  safeInspectEl.classList.remove('open');
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
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
      showNotice('門鎖已經解開。');
      return;
    }
    openDrawerPuzzle();
    return;
  }

  switch (target.dataset.safeItem) {
    case 'smallKey':
      if (addItem('smallKey')) {
        renderSafeInspect();
      }
      return;
    case 'pendant':
      if (addItem('pendant')) renderSafeInspect();
      return;
    case 'photo':
      if (addItem('photo')) {
        room.collectObject('photo');
        renderSafeInspect();
      }
      return;
    default:
      showNotice('沒有可互動的東西。');
  }
}

const photoPreviewModeClasses = [
  'story-preview',
  'framed-preview',
  'award-preview',
  'award-one-preview',
  'award-two-preview',
  'award-three-preview',
  'medals-preview',
  'empty-frame-preview',
] as const;

function clearPhotoPreviewMode(): void {
  photoInspectEl.classList.remove(...photoPreviewModeClasses);
  photoFrontImageEl.hidden = false;
}

function openPhotoInspect(framed = false): void {
  if (inventoryOpen) setInventoryOpen(false);
  storyPhotoPreview = null;
  staticWallPreview = false;
  photoInspectOpen = true;
  photoFlipped = false;
  detailItem = 'photo';
  move = { x: 0, y: 0 };
  photoFrontImageEl.src = couplePhotoImage;
  photoFrontImageEl.alt = '男女主角的合照';
  photoCardEl.style.aspectRatio = '1393 / 1129';
  clearPhotoPreviewMode();
  photoInspectEl.classList.add('open');
  if (framed) photoInspectEl.classList.add('framed-preview');
  photoInspectEl.classList.remove('flipped');
  photoCardEl.setAttribute('aria-label', '翻到照片背面');
  vibrate([35, 55, 35]);
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function openStoryPhotoInspect(photoId: StoryPhotoId): void {
  if (inventoryOpen) setInventoryOpen(false);
  const photo = storyPhotoDetails[photoId];
  storyPhotoPreview = photoId;
  staticWallPreview = true;
  photoInspectOpen = true;
  photoFlipped = false;
  detailItem = null;
  move = { x: 0, y: 0 };
  photoFrontImageEl.src = photo.image;
  photoFrontImageEl.alt = photo.label;
  photoCardEl.style.aspectRatio = photo.ratio;
  clearPhotoPreviewMode();
  photoInspectEl.classList.add('open', 'story-preview', 'framed-preview');
  photoInspectEl.classList.remove('flipped');
  photoCardEl.setAttribute('aria-label', photo.label);
  vibrate(35);
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function openAwardInspect(awardId: AwardPreviewId): void {
  if (inventoryOpen) setInventoryOpen(false);
  storyPhotoPreview = null;
  staticWallPreview = true;
  photoInspectOpen = true;
  photoFlipped = false;
  detailItem = null;
  move = { x: 0, y: 0 };
  photoFrontImageEl.src = firefighterAwardsImage;
  photoFrontImageEl.alt = '祈彥殉職褒揚狀，由局長尹馥華署名';
  photoCardEl.style.aspectRatio = '1086 / 1448';
  clearPhotoPreviewMode();
  photoInspectEl.classList.add('open', 'story-preview', 'award-preview', awardPreviewClasses[awardId]);
  photoInspectEl.classList.remove('flipped');
  photoCardEl.setAttribute('aria-label', photoFrontImageEl.alt);
  vibrate(35);
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function openEmptyFrameInspect(): void {
  if (inventoryOpen) setInventoryOpen(false);
  storyPhotoPreview = null;
  staticWallPreview = true;
  photoInspectOpen = true;
  photoFlipped = false;
  detailItem = null;
  move = { x: 0, y: 0 };
  photoFrontImageEl.hidden = true;
  photoFrontImageEl.alt = '';
  photoCardEl.style.aspectRatio = '1393 / 1129';
  clearPhotoPreviewMode();
  photoFrontImageEl.hidden = true;
  photoInspectEl.classList.add('open', 'story-preview', 'framed-preview', 'empty-frame-preview');
  photoInspectEl.classList.remove('flipped');
  photoCardEl.setAttribute('aria-label', '牆上的空相框');
  vibrate(25);
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function closePhotoInspect(): void {
  photoInspectOpen = false;
  photoFlipped = false;
  storyPhotoPreview = null;
  staticWallPreview = false;
  detailItem = null;
  move = { x: 0, y: 0 };
  photoFrontImageEl.src = couplePhotoImage;
  photoFrontImageEl.alt = '男女主角的合照';
  photoCardEl.style.aspectRatio = '1393 / 1129';
  photoCardEl.setAttribute('aria-label', '翻到照片背面');
  clearPhotoPreviewMode();
  photoInspectEl.classList.remove('open', 'flipped');
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
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
    if (storyPhotoPreview) {
      vibrate(25);
      return;
    }
    if (staticWallPreview) {
      if (!photoInspectEl.classList.contains('empty-frame-preview')) {
        vibrate(25);
        return;
      }
      if (selectedItem !== 'photo' || room.hasMountedCouplePhoto()) {
        vibrate(25);
        return;
      }
      if (!room.mountCouplePhoto()) return;
      consumeItem('photo');
      closePhotoInspect();
      playPhotoMemoryReveal();
      return;
    }
    if (!photoFlipped) {
      photoFlipped = true;
      photoClueRead = true;
      photoInspectEl.classList.add('flipped');
      photoCardEl.setAttribute('aria-label', '翻回照片正面');
      vibrate(45);
      updateTarget();
      checkChapterExit();
      return;
    }
    photoFlipped = false;
    photoInspectEl.classList.remove('flipped');
    photoCardEl.setAttribute('aria-label', '翻到照片背面');
    vibrate(35);
    updateTarget();
    return;
  }
  showNotice('沒有可互動的東西。');
}
function renderDeskDrawerInspect(): void {
  const nextImage = deskDrawerOpened
    ? DESK_DRAWER_INSPECT_IMAGES.opened
    : DESK_DRAWER_INSPECT_IMAGES.closed;
  if (deskDrawerInspectImageEl.getAttribute('src') !== nextImage) {
    deskDrawerInspectImageEl.src = nextImage;
  }
  deskDrawerInspectImageEl.alt = deskDrawerOpened
    ? '打開的老舊木製書桌抽屜'
    : '放大的老舊木製書桌抽屜';
  deskDrawerInspectEl.classList.toggle('opened', deskDrawerOpened);
  deskDrawerDoorHotspotEl.hidden = deskDrawerOpened;

  const hasTape = deskDrawerOpened && !collectedItems.has('tape');
  const hasBattery = deskDrawerOpened && !collectedItems.has('oldBattery');
  const hasBoxCutter = deskDrawerOpened && !collectedItems.has('boxCutter');
  drawerTapeLayerEl.hidden = !hasTape;
  drawerTapeHotspotEl.hidden = !hasTape;
  drawerBatteryLayerEl.hidden = !hasBattery;
  drawerBatteryHotspotEl.hidden = !hasBattery;
  drawerBoxCutterLayerEl.hidden = !hasBoxCutter;
  drawerBoxCutterHotspotEl.hidden = !hasBoxCutter;
}

function openDeskDrawerInspect(): void {
  if (inventoryOpen) setInventoryOpen(false);
  deskDrawerInspectOpen = true;
  move = { x: 0, y: 0 };
  renderDeskDrawerInspect();
  deskDrawerInspectEl.classList.add('open');
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function closeDeskDrawerInspect(): void {
  deskDrawerInspectOpen = false;
  move = { x: 0, y: 0 };
  deskDrawerInspectEl.classList.remove('open');
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function handleDeskDrawerInspect(): void {
  if (!target) return;
  if (target.dataset.deskDrawerBack) {
    closeDeskDrawerInspect();
    return;
  }
  if (target.dataset.deskDrawerDoor) {
    if (deskDrawerOpening || deskDrawerOpened) return;
    if (!deskDrawerUnlocked) {
      if (selectedItem !== 'smallKey') {
        void playHostSound('keypadReset', { volume: 0.5, playbackRate: 0.62 });
        vibrate([45, 65, 45]);
        return;
      }
      deskDrawerUnlocked = true;
      consumeItem('smallKey');
    }

    deskDrawerOpening = true;
    deskDrawerInspectEl.classList.add('opening');
    deskDrawerDoorHotspotEl.hidden = true;
    void playHostSound('keypadUnlock', { volume: 0.55, playbackRate: 0.76 });
    vibrate([55, 40, 90]);
    window.setTimeout(() => {
      deskDrawerOpening = false;
      deskDrawerOpened = true;
      deskDrawerInspectEl.classList.remove('opening');
      renderDeskDrawerInspect();
      updatePointer(pointer.x, pointer.y);
    }, 420);
    return;
  }
  if (target.dataset.deskDrawerItem === 'tape') {
    if (addItem('tape')) renderDeskDrawerInspect();
    return;
  }
  if (target.dataset.deskDrawerItem === 'oldBattery') {
    if (addItem('oldBattery')) renderDeskDrawerInspect();
    return;
  }
  if (target.dataset.deskDrawerItem === 'boxCutter') {
    if (addItem('boxCutter')) renderDeskDrawerInspect();
  }
}

function renderCardboardBoxInspect(): void {
  cardboardBoxInspectImageEl.src = cardboardBoxOpened
    ? CARDBOARD_BOX_INSPECT_IMAGES.opened
    : CARDBOARD_BOX_INSPECT_IMAGES.closed;
  cardboardBoxInspectImageEl.alt = cardboardBoxOpened
    ? '俯視打開的舊紙箱，裡面放著摺好的消防衣褲與頭盔'
    : '俯視放大的舊紙箱，橫向封箱膠帶仍未割開';
  cardboardBoxInspectEl.classList.toggle('opened', cardboardBoxOpened);
  cardboardBoxOpenHotspotEl.hidden = cardboardBoxOpened;
  cardboardBoxGearHotspotEl.hidden =
    !cardboardBoxOpened || collectedItems.has('firefighterGear');
}

function cardboardBoxCutPoint(): { x: number; y: number } | null {
  const bounds = cardboardBoxOpenHotspotEl.getBoundingClientRect();
  if (bounds.width <= 0 || bounds.height <= 0) return null;
  const clientX = ((pointer.x + 1) / 2) * window.innerWidth;
  const clientY = ((1 - pointer.y) / 2) * window.innerHeight;
  return {
    x: (clientX - bounds.left) / bounds.width,
    y: (clientY - bounds.top) / bounds.height,
  };
}

function setCardboardBoxCutVisual(
  progress: number,
  point?: { x: number; y: number },
): void {
  const gesture = cardboardBoxCutGesture;
  const currentX = point?.x ?? gesture?.startX ?? 0;
  const currentY = point?.y ?? gesture?.startY ?? 0.5;
  const startX = gesture?.startX ?? currentX;
  const direction = gesture?.direction || (startX <= 0.5 ? 1 : -1);
  const clampedProgress = Math.max(0, Math.min(1, progress));
  const traceEndX = startX + direction * (gesture?.furthestDistance ?? 0);
  const traceLeft = Math.min(startX, traceEndX);
  const traceWidth = Math.abs(traceEndX - startX);

  cardboardBoxInspectEl.style.setProperty('--box-cut-left', `${20 + traceLeft * 60}%`);
  cardboardBoxInspectEl.style.setProperty('--box-cut-top', `${36 + currentY * 18}%`);
  cardboardBoxInspectEl.style.setProperty('--box-cut-width', `${traceWidth * 60}%`);
  cardboardBoxOpenHotspotEl.style.setProperty('--box-cutter-x', `${currentX * 100}%`);
  cardboardBoxOpenHotspotEl.style.setProperty('--box-cutter-y', `${currentY * 100}%`);
  cardboardBoxCutToolEl.classList.toggle('reverse', direction < 0);
  cardboardBoxCutToolEl.style.opacity = clampedProgress >= 0 ? '' : '0';
}

function beginCardboardBoxCut(): void {
  if (
    cardboardBoxCutGesture ||
    !cardboardBoxInspectOpen ||
    cardboardBoxOpened ||
    selectedItem !== 'boxCutter' ||
    !target?.dataset.cardboardBoxOpen
  ) return;
  const point = cardboardBoxCutPoint();
  if (!point) return;
  const gesture = beginHorizontalCut(point.x, point.y, performance.now());
  if (!gesture) return;
  cardboardBoxCutGesture = gesture;
  cardboardBoxCutFeedbackStep = 0;
  setCardboardBoxCutVisual(0, point);
  cardboardBoxInspectEl.classList.add('cutting');
  vibrate(18);
}

function cancelCardboardBoxCut(feedback = false): void {
  if (!cardboardBoxCutGesture) return;
  cardboardBoxCutGesture = null;
  cardboardBoxCutFeedbackStep = 0;
  cardboardBoxInspectEl.classList.remove('cutting');
  setCardboardBoxCutVisual(0);
  if (feedback) vibrate([18, 35, 18]);
}

function completeCardboardBoxCut(): void {
  cardboardBoxCutGesture = null;
  cardboardBoxCutFeedbackStep = 0;
  cardboardBoxInspectEl.classList.remove('cutting');
  setCardboardBoxCutVisual(0);
  cardboardBoxOpened = true;
  consumeItem('boxCutter');
  renderCardboardBoxInspect();
  vibrate([35, 30, 65]);
  updatePointer(pointer.x, pointer.y);
}

function updateCardboardBoxCut(): void {
  if (!cardboardBoxCutGesture) return;
  if (
    !interactionHeld ||
    !cardboardBoxInspectOpen ||
    cardboardBoxOpened ||
    selectedItem !== 'boxCutter'
  ) {
    cancelCardboardBoxCut();
    return;
  }
  const point = cardboardBoxCutPoint();
  if (!point) {
    cancelCardboardBoxCut();
    return;
  }
  const previousDistance = cardboardBoxCutGesture.furthestDistance;
  const result = advanceHorizontalCut(
    cardboardBoxCutGesture,
    point.x,
    point.y,
    performance.now(),
  );
  if (result.status === 'cancelled') {
    cancelCardboardBoxCut(true);
    return;
  }
  cardboardBoxCutGesture = result.gesture;
  setCardboardBoxCutVisual(result.gesture.progress, point);
  if (result.gesture.furthestDistance > previousDistance + 0.002) {
    playCardboardCutSound(result.gesture.progress);
  }
  const feedbackStep = Math.floor(result.gesture.progress * 4);
  if (feedbackStep > cardboardBoxCutFeedbackStep && feedbackStep < 4) {
    cardboardBoxCutFeedbackStep = feedbackStep;
    vibrate(14);
  }
  if (result.status === 'completed') completeCardboardBoxCut();
}

function openCardboardBoxInspect(): void {
  if (inventoryOpen) setInventoryOpen(false);
  cardboardBoxInspectOpen = true;
  move = { x: 0, y: 0 };
  renderCardboardBoxInspect();
  cardboardBoxInspectEl.classList.add('open');
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function closeCardboardBoxInspect(): void {
  cancelCardboardBoxCut();
  cardboardBoxInspectOpen = false;
  move = { x: 0, y: 0 };
  cardboardBoxInspectEl.classList.remove('open');
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function handleCardboardBoxInspect(): void {
  if (!target) return;
  if (target.dataset.cardboardBoxBack) {
    closeCardboardBoxInspect();
    return;
  }
  if (target.dataset.cardboardBoxOpen) {
    if (selectedItem !== 'boxCutter') {
      vibrate([35, 55, 35]);
    }
    return;
  }
  if (target.dataset.cardboardBoxGear && !collectedItems.has('firefighterGear')) {
    if (!addItem('firefighterGear')) return;
    vibrate([45, 40, 85]);
    closeCardboardBoxInspect();
  }
}

function renderBedInspect(): void {
  const hasAntenna = !collectedItems.has('antenna');
  if (!bedGrabActive) {
    resetBedVideos();
    bedInspectEl.classList.remove('playing-scare');
  }
  bedInspectImageEl.src = publicUrl(
    hasAntenna
      ? 'assets/room307/photos/under-bed-antenna.png'
      : 'assets/room307/photos/under-bed-empty.png',
  );
  bedInspectImageEl.alt = hasAntenna
    ? '昏暗的床底與地上的天線'
    : '已經空了的昏暗床底';
  bedAntennaHotspotEl.hidden = !hasAntenna;
}

function openBedInspect(): void {
  if (inventoryOpen) setInventoryOpen(false);
  bedInspectOpen = true;
  move = { x: 0, y: 0 };
  renderBedInspect();
  bedInspectEl.classList.add('open');
  startBedInspectAudio();
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function closeBedInspect(): void {
  if (bedGrabActive) return;
  bedInspectOpen = false;
  move = { x: 0, y: 0 };
  bedInspectEl.classList.remove('open');
  stopBedReachAudio();
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function handleBedInspect(): void {
  if (bedEventPhase === 'death-menu') {
    if (target?.dataset.bedDeathRestart) {
      void restartGameAfterBedDeath();
      return;
    }
    if (target?.dataset.bedDeathClose) {
      void closeGameAfterBedDeath();
    }
    return;
  }
  if (bedGrabActive) return;
  if (collectedItems.has('antenna')) return;
  if (!target?.dataset.bedAntenna) {
    return;
  }
  void playBedAntennaScare();
}

function renderRadioInspect(): void {
  const hasTape = room.hasTapeInRecorder();
  radioInspectImageEl.src = hasTape && antennaInstalled
    ? RADIO_INSPECT_IMAGES.complete
    : antennaInstalled
      ? RADIO_INSPECT_IMAGES.antenna
    : hasTape
      ? RADIO_INSPECT_IMAGES.tape
      : RADIO_INSPECT_IMAGES.empty;
  radioInspectImageEl.alt = hasTape && antennaInstalled
    ? '已裝入錄音帶並接上天線的收錄音機'
    : hasTape
      ? '已裝入錄音帶的收錄音機'
      : antennaInstalled
        ? '已接上天線但磁帶槽仍空的收錄音機'
        : '磁帶槽與天線接口皆空的收錄音機';
}

function openRadioInspect(): void {
  if (inventoryOpen) setInventoryOpen(false);
  radioInspectOpen = true;
  move = { x: 0, y: 0 };
  renderRadioInspect();
  radioInspectEl.classList.add('open');
  showNotice(
    !room.hasTapeInRecorder()
      ? '磁帶槽是空的。'
      : !antennaInstalled
        ? '磁帶已經裝入，天線接口仍是空的。'
        : '收錄音機傳出雜訊。',
    2600,
  );
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function closeRadioInspect(): void {
  radioInspectOpen = false;
  move = { x: 0, y: 0 };
  radioInspectEl.classList.remove('open');
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function handleRadioInspect(): void {
  if (!target?.dataset.radioDevice) {
    showNotice('沒有可互動的東西。');
    return;
  }

  if (selectedItem === 'tape' && !room.hasTapeInRecorder()) {
    room.insertTapeIntoRecorder();
    consumeItem('tape');
    renderRadioInspect();
    showNotice('錄音帶卡進磁帶槽。', 1800);
    vibrate([45, 35, 75]);
    window.setTimeout(() => void playTapeRecording(), 650);
    return;
  }

  if (selectedItem === 'antenna' && !antennaInstalled) {
    antennaInstalled = true;
    consumeItem('antenna');
    renderRadioInspect();
    showNotice('天線接上了。', 1800);
    vibrate([45, 40, 80]);
    return;
  }

  if (!room.hasTapeInRecorder()) {
    showNotice('錄音機的磁帶槽是空的。');
    return;
  }
  if (!tapePlayed) {
    showNotice('磁帶正在轉動……');
    return;
  }
  if (!antennaInstalled) {
    showNotice('廣播天線的接口是空的。');
    return;
  }
  if (radioBroadcastHeard) {
    showNotice('只剩斷續雜訊。');
    return;
  }
  void playRadioBroadcast();
}

function returnToRoom(): void {
  if (drawerPuzzleOpen) closeDrawerPuzzle();
  if (photoInspectOpen) closePhotoInspect();
  if (deskDrawerInspectOpen) closeDeskDrawerInspect();
  if (cardboardBoxInspectOpen) closeCardboardBoxInspect();
  if (bedInspectOpen) closeBedInspect();
  if (radioInspectOpen) closeRadioInspect();
  if (safeInspectOpen) closeSafeInspect();
  if (inventoryOpen) setInventoryOpen(false);
  move = { x: 0, y: 0 };
  updatePointer(pointer.x, pointer.y);
}

function updateDrawerCodeDisplay(): void {
  drawerCodeSlotEls.forEach((slot, index) => {
    const digit = drawerCode[index] ?? '';
    slot.textContent = digit;
    slot.dataset.empty = String(!digit);
  });
  drawerCodeDisplayEl.setAttribute(
    'aria-label',
    drawerCode ? `已輸入 ${drawerCode.length} 位數字` : '尚未輸入密碼',
  );
}

function openDrawerPuzzle(): void {
  if (inventoryOpen) setInventoryOpen(false);
  drawerPuzzleOpen = true;
  drawerCode = '';
  move = { x: 0, y: 0 };
  drawerPuzzleEl.classList.add('open');
  updateDrawerCodeDisplay();
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function closeDrawerPuzzle(): void {
  drawerPuzzleOpen = false;
  drawerCode = '';
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

  if (drawerCode !== SAFE_CODE) {
    safeCodeFailures += 1;
    drawerCode = '';
    updateDrawerCodeDisplay();
    if (safeCodeFailures >= 2) {
      drawerPuzzleEl.classList.add('clue-boost');
      showNotice('祈望：手電筒照過去時，有幾枚暗紅色指印。', 4200);
    } else {
      clearNotice();
    }
    vibratePuzzleError();
    return;
  }

  playKeypadUnlockSound();
  safeCodeFailures = 0;
  drawerPuzzleEl.classList.remove('clue-boost');
  safeUnlocked = true;
  if (inventorySlots.includes('receipt')) consumeItem('receipt');
  closeDrawerPuzzle();
  room.openSafe();
  renderSafeInspect();
  showNotice('門鎖彈開了。');
  vibrate([80, 70, 80]);
  checkChapterExit();
}

function handleItemAction(item: ItemId, action: ProtoItemAction): void {
  if (tapePlaybackActive) return;
  if (!inventorySlots.includes(item)) return;
  if (action === 'inspect') {
    if (item === 'photo') {
      openPhotoInspect();
      return;
    }
    openItemDetail(item);
    return;
  }
  const combination = combineFirefighterEquipment(inventorySlots, selectedItem, item);
  if (combination) {
    inventorySlots.splice(0, inventorySlots.length, ...combination.slots);
    collectedItems.add(combination.item);
    selectedItem = combination.item;
    detailItem = null;
    void playHostSound('keypadUnlock', { volume: 0.34, playbackRate: 0.82 });
    vibrate([35, 40, 85]);
    syncControllerState();
    return;
  }
  const batteryInstallation = installPendantBattery(
    inventorySlots,
    selectedItem,
    item,
    pendantPowered,
  );
  if (batteryInstallation) {
    inventorySlots.splice(0, inventorySlots.length, ...batteryInstallation.slots);
    pendantPowered = true;
    selectedItem = batteryInstallation.selectedItem;
    detailItem = null;
    void playHostSound('keypadUnlock', { volume: 0.34, playbackRate: 1.25 });
    vibrate([35, 45, 80]);
    syncControllerState();
    return;
  }
  if (inventoryOpen && detailItem === item) {
    setInventoryOpen(false);
    if (item !== 'photo') {
      showNotice(`已收起：${itemLabels[item]}`);
      return;
    }
  }

  selectedItem = item;
  showNotice(
    item === 'pendant' && !pendantActivated
      ? '使用中：錄音吊飾。按住手機中央互動鍵，將它握緊。'
      : `使用中：${itemLabels[item]}`,
  );
  syncControllerState();
}

function openItemDetail(item: ItemId): void {
  if (drawerPuzzleOpen) closeDrawerPuzzle();
  if (photoInspectOpen) closePhotoInspect();
  if (deskDrawerInspectOpen) closeDeskDrawerInspect();
  if (cardboardBoxInspectOpen) closeCardboardBoxInspect();
  if (bedInspectOpen) closeBedInspect();
  if (radioInspectOpen) closeRadioInspect();
  if (safeInspectOpen) closeSafeInspect();
  detailItem = item;
  inventoryOpen = true;
  inventoryEl.classList.add('open');
  receiptPanelEl.classList.toggle('open', item === 'receipt');
  const useGenericPanel = item !== 'receipt';
  genericItemPanelEl.classList.toggle('open', useGenericPanel);
  if (useGenericPanel) {
    genericItemPreviewImage.src = itemDetails[item].image;
    genericItemPreviewImage.alt = itemLabels[item];
    genericItemNameEl.textContent = itemLabels[item];
    genericItemDescriptionEl.textContent =
      item === 'pendant' && pendantActivated
        ? '電池仍有微弱電力。握緊後，吊飾播放了熟悉的旋律。'
        : item === 'pendant' && pendantPowered
          ? '已裝入舊電池。握住吊飾時，按住手機中央互動鍵。'
        : itemDetails[item].description;
  }
  showNotice(
    item === 'receipt'
      ? '三組猜數字紀錄，最後一行已經看不清楚。'
      : `${itemLabels[item]}。${itemDetails[item].description}`,
  );
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

function setInventoryOpen(open: boolean): void {
  inventoryOpen = open;
  inventoryEl.classList.toggle('open', open);
  if (!open) {
    detailItem = null;
    receiptPanelEl.classList.remove('open', 'rubbing');
    genericItemPanelEl.classList.remove('open');
    genericItemPreviewImage.removeAttribute('src');
    genericItemPreviewImage.alt = '';
  }
  syncControllerState();
  updatePointer(pointer.x, pointer.y);
}

let lastTime = performance.now();

function frame(time: number): void {
  const delta = Math.min((time - lastTime) / 1000, 0.05);
  lastTime = time;
  if (ws) {
    const blend = 1 - Math.exp(-delta * 32);
    const nextX = pointer.x + (pointerTarget.x - pointer.x) * blend;
    const nextY = pointer.y + (pointerTarget.y - pointer.y) * blend;
    updatePointer(
      Math.abs(pointerTarget.x - nextX) < 0.0005 ? pointerTarget.x : nextX,
      Math.abs(pointerTarget.y - nextY) < 0.0005 ? pointerTarget.y : nextY,
    );
  }
  const movedDistance = room.update(
    delta,
    time / 1000,
    pointer,
    move,
    !isInterfaceOpen() && !photoMemoryActive,
  );
  updateFootsteps(movedDistance);

  if (!isInterfaceOpen()) updateTarget();
  requestAnimationFrame(frame);
}

window.addEventListener('resize', () => room.resize());
window.addEventListener('pointerdown', unlockHostAudio, { capture: true });
window.addEventListener('keydown', unlockHostAudio, { capture: true });
audioEnableBtn.addEventListener('click', () => void toggleHostAudio());
ambienceAudio.addEventListener('playing', updateHostAudioButton);
ambienceAudio.addEventListener('pause', updateHostAudioButton);

window.addEventListener('mousemove', (event) => {
  if (ws) return;
  pointerTarget = {
    x: (event.clientX / window.innerWidth) * 2 - 1,
    y: -((event.clientY / window.innerHeight) * 2 - 1),
  };
  updatePointer(pointerTarget.x, pointerTarget.y);
});

qrCanvas.style.visibility = 'hidden';
joinUrlEl.textContent = '正在啟動手機連線服務，請稍候。';
connect();
updateHostAudioButton();
ambienceAudio.load();
void startAmbientAudio();
const initialAudioContext = ensureHostAudioContext();
if (initialAudioContext) {
  void loadHostAudioAssets(initialAudioContext).then(updateHostAudioButton).catch(updateHostAudioButton);
}

if (import.meta.env.DEV) {
  const inspection = new URLSearchParams(location.search).get('inspect');
  if (inspection) {
    overlayEl.classList.add('hidden');
    window.setTimeout(() => overlayEl.classList.add('hidden'), 250);
  }
  if (inspection === 'keypad') {
    openDrawerPuzzle();
    drawerCode = new URLSearchParams(location.search).get('code')?.replace(/\D/g, '').slice(0, 4) ?? '';
    updateDrawerCodeDisplay();
  } else if (inspection === 'receipt') {
    room.openWardrobe('left');
  } else if (inspection === 'receipt-middle') {
    room.openWardrobe('middle');
  } else if (inspection === 'receipt-picked') {
    room.openWardrobe('left');
    room.collectObject('receipt');
  } else if (inspection === 'firefighter-mask-picked') {
    room.collectObject('firefighterMask');
  } else if (inspection === 'safe') {
    safeUnlocked = true;
    openSafeInspect();
  } else if (inspection === 'safe-empty') {
    safeUnlocked = true;
    collectedItems.add('photo');
    collectedItems.add('pendant');
    collectedItems.add('tape');
    room.collectObject('photo');
    room.collectObject('tape');
    openSafeInspect();
  } else if (inspection === 'desk-photos') {
    room.navigate('left');
  } else if (inspection === 'wall-photos') {
    room.navigate('left');
    room.navigate('left');
  } else if (inspection === 'wall-mounted') {
    collectedItems.add('photo');
    room.collectObject('photo');
    room.mountCouplePhoto();
  } else if (inspection === 'photo-memory') {
    collectedItems.add('photo');
    room.collectObject('photo');
    room.mountCouplePhoto();
    playPhotoMemoryReveal();
  } else if (inspection === 'story-family') {
    openStoryPhotoInspect('familyPhoto');
  } else if (inspection === 'story-firefighter') {
    openStoryPhotoInspect('firefighterPhoto');
  } else if (inspection === 'story-girlfriend') {
    openStoryPhotoInspect('girlfriendPhoto');
  } else if (inspection === 'story-award-one') {
    openAwardInspect('firefighterAward');
  } else if (inspection === 'story-empty-frame') {
    openEmptyFrameInspect();
  } else if (inspection === 'desk-photo-picked') {
    collectedItems.add('photo');
    room.collectObject('photo');
    room.navigate('left');
  } else if (inspection === 'photo') {
    addItem('photo');
    openPhotoInspect();
  } else if (inspection === 'photo-back') {
    addItem('photo');
    openPhotoInspect();
    photoFlipped = true;
    photoClueRead = true;
    photoInspectEl.classList.add('flipped');
    photoCardEl.setAttribute('aria-label', '翻回照片正面');
  } else if (inspection === 'desk-drawer') {
    deskDrawerUnlocked = true;
    deskDrawerOpened = true;
    openDeskDrawerInspect();
  } else if (inspection === 'desk-drawer-closed') {
    openDeskDrawerInspect();
  } else if (inspection === 'cardboard-box') {
    openCardboardBoxInspect();
  } else if (inspection === 'cardboard-box-cut') {
    addItem('boxCutter');
    selectedItem = 'boxCutter';
    openCardboardBoxInspect();
    cardboardBoxCutGesture = {
      startX: 0.18,
      startY: 0.5,
      furthestDistance: 0.3,
      lastX: 0.48,
      direction: 1,
      startedAt: performance.now() - 300,
      progress: 0.65,
    };
    interactionHeld = true;
    pointer = { x: -0.0848, y: 0.34 };
    pointerTarget = pointer;
    cardboardBoxInspectEl.classList.add('cutting');
    setCardboardBoxCutVisual(0.65, { x: 0.48, y: 0.5 });
  } else if (inspection === 'cardboard-box-open') {
    cardboardBoxOpened = true;
    openCardboardBoxInspect();
  } else if (inspection === 'firefighter-mask-detail') {
    addItem('firefighterMask');
    openItemDetail('firefighterMask');
  } else if (inspection === 'firefighter-complete-detail') {
    addItem('completeFirefighterGear');
    openItemDetail('completeFirefighterGear');
  } else if (inspection === 'firefighter-auto-combine-detail') {
    addItem('firefighterGear');
    addItem('firefighterMask');
    room.collectObject('firefighterMask');
    openItemDetail('completeFirefighterGear');
  } else if (inspection === 'bed') {
    openBedInspect();
  } else if (inspection === 'bed-grab' || inspection === 'bed-grab-success') {
    collectedItems.delete('antenna');
    bedEventVideos.forEach((video) => {
      video.muted = true;
    });
    openBedInspect();
    window.setTimeout(() => void playBedAntennaScare(), 250);
    if (inspection === 'bed-grab-success') {
      const autoEscapeTimer = window.setInterval(() => {
        if (bedEventPhase !== 'struggle') return;
        window.clearInterval(autoEscapeTimer);
        for (let index = 0; index < 8; index += 1) {
          window.setTimeout(() => registerBedShake(1), index * 140);
        }
      }, 100);
    }
  } else if (inspection === 'radio') {
    openRadioInspect();
  } else if (inspection === 'radio-antenna') {
    antennaInstalled = true;
    openRadioInspect();
  } else if (inspection === 'radio-tape') {
    room.insertTapeIntoRecorder();
    openRadioInspect();
  } else if (inspection === 'radio-full') {
    room.insertTapeIntoRecorder();
    antennaInstalled = true;
    openRadioInspect();
  } else if (inspection === 'radio-playing') {
    room.insertTapeIntoRecorder();
    tapePlayed = true;
    antennaInstalled = true;
    openRadioInspect();
    window.setTimeout(() => void playRadioBroadcast(), 400);
  }
}

requestAnimationFrame(frame);
