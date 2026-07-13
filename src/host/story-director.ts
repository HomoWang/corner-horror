import * as THREE from 'three';
import type { HostAudioEngine } from './audio';
import type { ControllerCueId } from '../shared/protocol';
import type { StoryActionId, StoryScreenId } from '../shared/story';
import type { Direction3 } from '../shared/event-engine';

export type StoryEnding = 'open' | 'sealed';
export type PhotoInspectionState = 'hidden' | 'front' | 'back';
export type TapePlaybackState = 'hidden' | 'warning-one' | 'warning-two';
export type ManifestationEffect = 'shadow-left' | 'shadow-right' | 'flicker' | 'blackout';

export interface StoryVisualState {
  window: 'hidden' | 'ready' | 'broken' | 'sealed';
  portrait: 'normal' | 'ready' | 'changed' | 'sealed';
  drawer: 'normal' | 'ready' | 'open';
  door: 'normal' | 'ready' | 'shadow' | 'sealed';
  footsteps: boolean;
}

type StoryState =
  | 'idle'
  | 'prologue'
  | 'incoming'
  | 'call-window'
  | 'find-window'
  | 'window-opened'
  | 'find-portrait'
  | 'portrait-inspect-front'
  | 'portrait-inspect-back'
  | 'portrait-changed'
  | 'find-drawer'
  | 'keypad'
  | 'keypad-complete'
  | 'tape-one'
  | 'tape-two'
  | 'find-door'
  | 'door-listen'
  | 'door-choice'
  | 'reseal-portrait'
  | 'reseal-window'
  | 'reseal-door'
  | 'open-scare'
  | 'sealed-scare'
  | 'ending-open'
  | 'ending-sealed';

export interface StoryDirectorCallbacks {
  sendScreen(screen: StoryScreenId): void;
  sendCue(cue: ControllerCueId): void;
  setFrame(frame: number): void;
  setJumpscareVisible(visible: boolean): void;
  setVisual(state: StoryVisualState): void;
  setPrompt(text: string | null): void;
  setCodeDigits(value: string): void;
  setChoiceFocus(choice: 'seal' | 'open' | null): void;
  setPhotoInspection(state: PhotoInspectionState): void;
  setTapePlayback(state: TapePlaybackState): void;
  setDoorListening(active: boolean): void;
  setCinematicChromeHidden(hidden: boolean): void;
  triggerManifestation(effect: ManifestationEffect): void;
  showNotice(text: string): void;
  onEnding(ending: StoryEnding): void;
  onRestart(): void;
}

const WINDOW_TARGET = new THREE.Vector3(-2.2, 1.55, -3.3);
const PORTRAIT_TARGET = new THREE.Vector3(0.55, 1.65, -3.4);
const DRAWER_TARGET = new THREE.Vector3(-2.15, 0.72, -3.25);
const DOOR_TARGET = new THREE.Vector3(2.05, 1.45, -3.35);
const CHOICE_SEAL_TARGET = new THREE.Vector3(-1.35, 1.2, -3.35);
const CHOICE_OPEN_TARGET = new THREE.Vector3(1.35, 1.2, -3.35);

function defaultVisualState(): StoryVisualState {
  return {
    window: 'hidden',
    portrait: 'normal',
    drawer: 'normal',
    door: 'normal',
    footsteps: false,
  };
}

export class StoryDirector {
  private state: StoryState = 'idle';
  private stateSeconds = 0;
  private actionWasPressed = false;
  private hintPlayed = false;
  private code = '';
  private jumpscareHidden = false;
  private tensionCuePlayed = false;
  private eventStage = 0;
  private nextIncomingRingAt = Number.POSITIVE_INFINITY;
  private endingRingTimer: ReturnType<typeof setTimeout> | null = null;
  private visual = defaultVisualState();

  constructor(
    private readonly origin: THREE.Vector3,
    private readonly audio: HostAudioEngine,
    private readonly callbacks: StoryDirectorCallbacks,
  ) {}

  start(): void {
    this.reset();
    this.audio.startScore();
    this.audio.setTension(0.12);
    this.callbacks.sendCue('ambience-start');
    this.callbacks.onRestart();
    this.enter('prologue', 'prologue');
  }

  reset(): void {
    if (this.endingRingTimer !== null) clearTimeout(this.endingRingTimer);
    this.endingRingTimer = null;
    this.state = 'idle';
    this.stateSeconds = 0;
    this.actionWasPressed = false;
    this.hintPlayed = false;
    this.code = '';
    this.jumpscareHidden = false;
    this.tensionCuePlayed = false;
    this.eventStage = 0;
    this.nextIncomingRingAt = Number.POSITIVE_INFINITY;
    this.visual = defaultVisualState();
    this.callbacks.setVisual(this.visual);
    this.callbacks.setPrompt(null);
    this.callbacks.setCodeDigits('');
    this.callbacks.setChoiceFocus(null);
    this.callbacks.setPhotoInspection('hidden');
    this.callbacks.setTapePlayback('hidden');
    this.callbacks.setDoorListening(false);
    this.callbacks.setCinematicChromeHidden(false);
    this.callbacks.setFrame(0);
    this.callbacks.setJumpscareVisible(false);
    this.audio.setTension(0);
    this.audio.stopScore();
    this.callbacks.sendCue('ambience-stop');
    this.callbacks.sendScreen('standby');
  }

  update(deltaSeconds: number, direction: Direction3 | null, actionPressed: boolean): void {
    const delta = Math.max(0, deltaSeconds);
    this.stateSeconds += delta;
    const actionRisingEdge = actionPressed && !this.actionWasPressed;
    this.actionWasPressed = actionPressed;

    if (this.state === 'prologue' && this.stateSeconds >= 7.2) {
      this.enter('incoming', 'incoming-407');
      this.callbacks.sendCue('ring');
      this.nextIncomingRingAt = 5.6;
      return;
    }

    if (this.state === 'incoming' && this.stateSeconds >= this.nextIncomingRingAt) {
      this.callbacks.sendCue('ring');
      this.nextIncomingRingAt += 5.6;
    }

    if (
      this.state === 'portrait-inspect-front' &&
      this.stateSeconds >= 1.1 &&
      !this.tensionCuePlayed
    ) {
      this.tensionCuePlayed = true;
      this.callbacks.sendCue('whisper');
      this.callbacks.showNotice('照片玻璃內側，慢慢浮出第四個人的呼吸痕跡。');
    }

    if (
      this.state === 'portrait-inspect-back' &&
      this.stateSeconds >= 1.4 &&
      !this.tensionCuePlayed
    ) {
      this.tensionCuePlayed = true;
      this.audio.playSting(0.22);
      this.callbacks.sendCue('impact');
      this.callbacks.showNotice('刮擦聲不是從你手上的照片傳來。它在你身後。');
    }

    if (this.state === 'portrait-inspect-back' && this.stateSeconds >= 2.25 && this.eventStage === 0) {
      this.eventStage = 1;
      this.callbacks.triggerManifestation('shadow-left');
      this.audio.playFootsteps();
    }

    if (this.state === 'find-portrait' && this.stateSeconds >= 4.8 && !this.tensionCuePlayed) {
      this.tensionCuePlayed = true;
      this.callbacks.sendCue('whisper');
      this.callbacks.showNotice('牆上的照片輕輕歪了一次。房間裡沒有風。');
    }

    if (this.state === 'find-drawer' && this.stateSeconds >= 5.2 && !this.tensionCuePlayed) {
      this.tensionCuePlayed = true;
      this.audio.playFootsteps();
      this.callbacks.sendCue('whisper');
      this.callbacks.showNotice('抽屜裡響了一聲。接著，聲音從你身後又響了一次。');
    }

    if (this.state === 'tape-one') {
      if (this.stateSeconds >= 1.25 && this.eventStage === 0) {
        this.eventStage = 1;
        this.audio.playStatic();
      }
      if (this.stateSeconds >= 3.7 && this.eventStage === 1) {
        this.eventStage = 2;
        this.callbacks.triggerManifestation('shadow-left');
        this.audio.playFootsteps();
        this.callbacks.showNotice('錄音裡的腳步聲，和房間左側同時停下。');
      }
    }

    if (this.state === 'tape-two') {
      if (this.stateSeconds >= 1.2 && this.eventStage === 0) {
        this.eventStage = 1;
        this.callbacks.triggerManifestation('flicker');
        this.audio.playStatic();
      }
      if (this.stateSeconds >= 4.1 && this.eventStage === 1) {
        this.eventStage = 2;
        this.callbacks.triggerManifestation('shadow-right');
        this.callbacks.sendCue('whisper');
        this.callbacks.showNotice('錄音帶停了一拍。右側門縫裡，有東西也停了下來。');
      }
    }

    if (this.state === 'door-listen') {
      if (this.stateSeconds >= 0.65 && this.eventStage === 0) {
        this.eventStage = 1;
        this.audio.playKnock();
        this.callbacks.triggerManifestation('flicker');
      }
      if (this.stateSeconds >= 2.45 && this.eventStage === 1) {
        this.eventStage = 2;
        this.audio.playFootsteps();
        this.callbacks.triggerManifestation('shadow-left');
        this.callbacks.showNotice('哭聲在門外；濕腳步卻在你背後。');
      }
      if (this.stateSeconds >= 4.75 && this.eventStage === 2) {
        this.eventStage = 3;
        this.callbacks.sendCue('ring');
        this.callbacks.showNotice('手機來電。門外，同一支鈴聲也響了。');
      }
    }

    if (this.state === 'open-scare') {
      if (this.stateSeconds >= 0.55 && this.eventStage === 0) {
        this.eventStage = 1;
        this.callbacks.triggerManifestation('blackout');
      }
      if (this.stateSeconds >= 2.2 && !this.jumpscareHidden) {
        this.jumpscareHidden = true;
        this.callbacks.setJumpscareVisible(true);
        this.callbacks.sendCue('jumpscare');
        this.audio.playJumpscare();
      }
      if (this.stateSeconds >= 4.7) this.finish('open');
      return;
    }

    if (this.state === 'sealed-scare') {
      if (this.stateSeconds >= 0.55 && this.eventStage === 0) {
        this.eventStage = 1;
        this.callbacks.triggerManifestation('flicker');
      }
      if (this.stateSeconds >= 1.45 && !this.jumpscareHidden) {
        this.jumpscareHidden = true;
        this.callbacks.setFrame(2);
        this.callbacks.sendCue('impact');
        this.audio.playSting(0.9);
      }
      if (this.stateSeconds >= 2.65 && this.eventStage === 1) {
        this.eventStage = 2;
        this.callbacks.triggerManifestation('shadow-left');
        this.callbacks.sendCue('whisper');
        this.callbacks.showNotice('你照著錄音沒有轉身。背後的呼吸，慢慢退回牆裡。');
      }
      if (this.stateSeconds >= 4.35) this.finish('sealed');
      return;
    }

    if (this.state === 'keypad-complete') {
      if (this.stateSeconds >= 0.65) {
        this.setVisual({ drawer: 'open' });
        this.audio.playStatic();
        this.callbacks.sendCue('whisper');
        this.callbacks.setTapePlayback('warning-one');
        this.enter('tape-one', 'tape-warning-one');
      }
      return;
    }

    if (this.state === 'door-choice') {
      this.updateDoorChoice(direction, actionRisingEdge);
      return;
    }

    if (actionRisingEdge && this.handleCentralAction()) return;

    const interaction = this.interactionForState();
    if (!interaction) {
      this.callbacks.setPrompt(null);
      return;
    }

    const looking = direction !== null && this.isLookingAt(direction, interaction.target);
    this.callbacks.setPrompt(looking ? interaction.prompt : null);
    if (looking && actionRisingEdge) {
      interaction.activate();
      return;
    }

    if (!this.hintPlayed && this.stateSeconds >= 18) {
      this.hintPlayed = true;
      this.callbacks.sendCue('whisper');
      this.callbacks.showNotice(interaction.hint);
    }
  }

  handleStoryAction(id: StoryActionId, value?: string): void {
    if (this.state === 'incoming' && id === 'answer') {
      this.callbacks.sendCue('whisper');
      this.enter('call-window', 'call-window');
      return;
    }
    if (this.state === 'call-window' && id === 'continue') {
      this.setVisual({ window: 'ready' });
      this.enter('find-window', 'find-window');
      return;
    }
    if (this.state === 'window-opened' && id === 'continue') {
      this.setVisual({ portrait: 'ready' });
      this.enter('find-portrait', 'find-portrait');
      return;
    }
    if (this.state === 'portrait-inspect-front' && id === 'continue') {
      this.flipPortrait();
      return;
    }
    if (this.state === 'portrait-inspect-back' && id === 'continue') {
      this.closePortraitInspection();
      return;
    }
    if (this.state === 'portrait-changed' && id === 'continue') {
      this.setVisual({ drawer: 'ready' });
      this.enter('find-drawer', 'find-drawer');
      return;
    }
    if (this.state === 'keypad') {
      if (id === 'digit' && value && this.code.length < 4) {
        this.code += value;
        this.callbacks.setCodeDigits(this.code);
        return;
      }
      if (id === 'clear-code') {
        this.code = '';
        this.callbacks.setCodeDigits('');
        return;
      }
      if (id === 'submit-code') {
        if (this.code !== '0317') {
          this.code = '';
          this.callbacks.setCodeDigits('');
          this.callbacks.sendCue('impact');
          this.audio.playSting(0.35);
          this.callbacks.showNotice('密碼錯誤。牆上照片背面的死亡時間是 03：17。');
          this.callbacks.sendScreen('keypad-0317');
          return;
        }
        this.setVisual({ drawer: 'open' });
        this.audio.playStatic();
        this.callbacks.sendCue('whisper');
        this.callbacks.setTapePlayback('warning-one');
        this.enter('tape-one', 'tape-warning-one');
        return;
      }
    }
    if (this.state === 'tape-one' && id === 'continue') {
      this.audio.playStatic();
      this.callbacks.setTapePlayback('warning-two');
      this.enter('tape-two', 'tape-warning-two');
      return;
    }
    if (this.state === 'tape-two' && id === 'continue') {
      this.audio.setTension(0.72);
      this.audio.playKnock();
      this.callbacks.setTapePlayback('hidden');
      this.setVisual({ door: 'ready', footsteps: true });
      this.enter('find-door', 'find-door');
      return;
    }
    if (this.state === 'door-listen' && id === 'continue') {
      this.callbacks.setDoorListening(false);
      this.audio.playSting(0.28);
      this.enter('door-choice', 'door-choice');
      return;
    }
    if (this.state === 'door-choice' && id === 'choose-open') {
      this.callbacks.setDoorListening(false);
      this.callbacks.showNotice('');
      this.callbacks.sendScreen('standby');
      this.callbacks.setCinematicChromeHidden(true);
      this.setVisual({ door: 'shadow', footsteps: false });
      this.callbacks.setFrame(2);
      this.audio.playDoor();
      this.audio.setTension(1);
      this.enter('open-scare');
      return;
    }
    if (this.state === 'door-choice' && id === 'choose-seal') {
      this.callbacks.setDoorListening(false);
      this.setVisual({ portrait: 'ready', door: 'shadow' });
      this.enter('reseal-portrait', 'reseal-portrait');
      return;
    }
    if ((this.state === 'ending-open' || this.state === 'ending-sealed') && id === 'continue') {
      this.start();
    }
  }

  get currentState(): string {
    return this.state;
  }

  get enteredCode(): string {
    return this.code;
  }

  private interactionForState(): {
    target: THREE.Vector3;
    prompt: string;
    hint: string;
    activate: () => void;
  } | null {
    switch (this.state) {
      case 'find-window':
        return {
          target: WINDOW_TARGET,
          prompt: '按「壓下窗扣」',
          hint: '窗戶在畫面左側。慢慢把光移向滲水的玻璃。',
          activate: () => {
            this.setVisual({ window: 'broken' });
            this.audio.playThunder();
            this.audio.playJumpscare();
            this.callbacks.setJumpscareVisible(true);
            this.callbacks.sendCue('jumpscare');
            this.enter('window-opened', 'window-opened');
          },
        };
      case 'find-portrait':
        return {
          target: PORTRAIT_TARGET,
          prompt: '按中央鍵：拿起照片',
          hint: '家庭照掛在牆面中央，門的左邊。',
          activate: () => {
            this.callbacks.setPhotoInspection('front');
            this.enter('portrait-inspect-front', 'portrait-inspect-front');
          },
        };
      case 'find-drawer':
        return {
          target: DRAWER_TARGET,
          prompt: '按「檢查抽屜」',
          hint: '抽屜在畫面左下方的矮櫃。',
          activate: () => {
            this.code = '';
            this.callbacks.setCodeDigits('');
            this.enter('keypad', 'keypad-0317');
          },
        };
      case 'find-door':
        return {
          target: DOOR_TARGET,
          prompt: '按「握住鑰匙」',
          hint: '房門在畫面右側。腳印正往那裡移動。',
          activate: () => {
            this.audio.playFootsteps();
            this.callbacks.setDoorListening(true);
            this.setVisual({ door: 'shadow', footsteps: false });
            this.enter('door-listen', 'door-listen');
          },
        };
      case 'reseal-portrait':
        return {
          target: PORTRAIT_TARGET,
          prompt: '按「封住照片」',
          hint: '第一道封印在牆中央的照片後面。',
          activate: () => {
            this.setVisual({ portrait: 'sealed', window: 'ready' });
            this.callbacks.setFrame(0);
            this.audio.playFootsteps();
            this.enter('reseal-window', 'reseal-window');
          },
        };
      case 'reseal-window':
        return {
          target: WINDOW_TARGET,
          prompt: '按「纏回紅線」',
          hint: '第二道封印在畫面左側的窗扣。',
          activate: () => {
            this.setVisual({ window: 'sealed', door: 'ready' });
            this.audio.playKnock();
            this.enter('reseal-door', 'reseal-door');
          },
        };
      case 'reseal-door':
        return {
          target: DOOR_TARGET,
          prompt: '按「反鎖房門」',
          hint: '最後一道封印是畫面右側的門鎖。不要轉身。',
          activate: () => {
            this.setVisual({ door: 'sealed', footsteps: false });
            this.audio.playDoor();
            this.audio.setTension(0.25);
            this.callbacks.showNotice('');
            this.callbacks.sendScreen('standby');
            this.callbacks.setCinematicChromeHidden(true);
            this.enter('sealed-scare');
          },
        };
      default:
        return null;
    }
  }

  private isLookingAt(direction: Direction3, target: THREE.Vector3, maxAngleDeg = 23): boolean {
    const targetDirection = target.clone().sub(this.origin).normalize();
    const sample = new THREE.Vector3(...direction).normalize();
    return sample.dot(targetDirection) >= Math.cos(THREE.MathUtils.degToRad(maxAngleDeg));
  }

  private enter(state: StoryState, screen?: StoryScreenId): void {
    this.state = state;
    this.stateSeconds = 0;
    this.hintPlayed = false;
    this.tensionCuePlayed = false;
    this.eventStage = 0;
    if (state !== 'incoming') this.nextIncomingRingAt = Number.POSITIVE_INFINITY;
    this.callbacks.setPrompt(null);
    if (state !== 'door-choice') this.callbacks.setChoiceFocus(null);
    if (screen) this.callbacks.sendScreen(screen);
  }

  private handleCentralAction(): boolean {
    switch (this.state) {
      case 'incoming':
        this.handleStoryAction('answer');
        return true;
      case 'call-window':
        if (this.stateSeconds < 2.8) return true;
        this.handleStoryAction('continue');
        return true;
      case 'window-opened':
        if (this.stateSeconds < 3.2) return true;
        this.handleStoryAction('continue');
        return true;
      case 'portrait-inspect-front':
        if (this.stateSeconds < 1.8) return true;
        this.flipPortrait();
        return true;
      case 'portrait-inspect-back':
        if (this.stateSeconds < 3.0) return true;
        this.closePortraitInspection();
        return true;
      case 'portrait-changed':
        if (this.stateSeconds < 2.4) return true;
        this.handleStoryAction('continue');
        return true;
      case 'tape-one':
        if (this.stateSeconds < 7.2) return true;
        this.handleStoryAction('continue');
        return true;
      case 'tape-two':
        if (this.stateSeconds < 7.2) return true;
        this.handleStoryAction('continue');
        return true;
      case 'door-listen':
        if (this.stateSeconds < 6.2) return true;
        this.handleStoryAction('continue');
        return true;
      case 'ending-open':
      case 'ending-sealed':
        this.handleStoryAction('continue');
        return true;
      case 'keypad':
        this.advanceCode();
        return true;
      default:
        return false;
    }
  }

  private flipPortrait(): void {
    this.callbacks.setPhotoInspection('back');
    this.audio.playStatic();
    this.callbacks.sendCue('whisper');
    this.enter('portrait-inspect-back', 'portrait-inspect-back');
  }

  private closePortraitInspection(): void {
    this.callbacks.setPhotoInspection('hidden');
    this.setVisual({ portrait: 'changed' });
    this.callbacks.setFrame(1);
    this.audio.playSting(0.62);
    this.callbacks.sendCue('impact');
    this.enter('portrait-changed', 'portrait-changed');
  }

  private advanceCode(): void {
    const expected = '0317';
    if (this.code.length >= expected.length) return;
    this.code += expected[this.code.length];
    this.callbacks.setCodeDigits(this.code);
    this.audio.playSting(0.12);
    this.callbacks.sendCue('impact');
    if (this.code.length === expected.length) {
      this.state = 'keypad-complete';
      this.stateSeconds = 0;
      this.callbacks.setPrompt(null);
    }
  }

  private updateDoorChoice(direction: Direction3 | null, actionRisingEdge: boolean): void {
    let focus: 'seal' | 'open' | null = null;
    if (direction && this.isLookingAt(direction, CHOICE_SEAL_TARGET, 30)) focus = 'seal';
    if (direction && this.isLookingAt(direction, CHOICE_OPEN_TARGET, 30)) focus = 'open';
    this.callbacks.setChoiceFocus(focus);
    this.callbacks.setPrompt(
      focus === 'seal'
        ? '按中央鍵：重新封印'
        : focus === 'open'
          ? '按中央鍵：打開房門'
          : '用光照向左或右的選擇',
    );
    if (!actionRisingEdge || !focus) return;
    this.handleStoryAction(focus === 'seal' ? 'choose-seal' : 'choose-open');
  }

  private setVisual(patch: Partial<StoryVisualState>): void {
    this.visual = { ...this.visual, ...patch };
    this.callbacks.setVisual(this.visual);
  }

  private finish(ending: StoryEnding): void {
    this.callbacks.setJumpscareVisible(false);
    this.callbacks.setCinematicChromeHidden(false);
    this.callbacks.setFrame(ending === 'sealed' ? 0 : 3);
    this.audio.setTension(ending === 'sealed' ? 0.08 : 0);
    this.audio.stopScore();
    this.callbacks.sendCue('ambience-stop');
    const state = ending === 'open' ? 'ending-open' : 'ending-sealed';
    const screen = ending === 'open' ? 'ending-open' : 'ending-sealed';
    this.enter(state, screen);
    this.callbacks.onEnding(ending);
    if (ending === 'sealed') {
      this.endingRingTimer = setTimeout(() => {
        this.endingRingTimer = null;
        this.callbacks.sendCue('ring');
      }, 1800);
    }
  }
}
