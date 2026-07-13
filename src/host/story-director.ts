import * as THREE from 'three';
import type { HostAudioEngine } from './audio';
import type { ControllerCueId } from '../shared/protocol';
import type { StoryActionId, StoryScreenId } from '../shared/story';
import type { Direction3 } from '../shared/event-engine';

export type StoryEnding = 'open' | 'sealed';

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
  | 'portrait-changed'
  | 'find-drawer'
  | 'keypad'
  | 'tape-one'
  | 'tape-two'
  | 'find-door'
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
  showNotice(text: string): void;
  onEnding(ending: StoryEnding): void;
  onRestart(): void;
}

const WINDOW_TARGET = new THREE.Vector3(-2.2, 1.55, -3.3);
const PORTRAIT_TARGET = new THREE.Vector3(0.55, 1.65, -3.4);
const DRAWER_TARGET = new THREE.Vector3(-2.15, 0.72, -3.25);
const DOOR_TARGET = new THREE.Vector3(2.05, 1.45, -3.35);

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
    this.visual = defaultVisualState();
    this.callbacks.setVisual(this.visual);
    this.callbacks.setPrompt(null);
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

    if (this.state === 'prologue' && this.stateSeconds >= 4.2) {
      this.enter('incoming', 'incoming-407');
      this.callbacks.sendCue('ring');
      return;
    }

    if (this.state === 'open-scare') {
      if (this.stateSeconds >= 1.15 && !this.jumpscareHidden) {
        this.jumpscareHidden = true;
        this.callbacks.setJumpscareVisible(true);
        this.callbacks.sendCue('jumpscare');
        this.audio.playJumpscare();
      }
      if (this.stateSeconds >= 3.35) this.finish('open');
      return;
    }

    if (this.state === 'sealed-scare') {
      if (this.stateSeconds >= 0.85 && !this.jumpscareHidden) {
        this.jumpscareHidden = true;
        this.callbacks.setFrame(2);
        this.callbacks.sendCue('impact');
        this.audio.playSting(0.9);
      }
      if (this.stateSeconds >= 2.5) this.finish('sealed');
      return;
    }

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
    if (this.state === 'portrait-changed' && id === 'continue') {
      this.setVisual({ drawer: 'ready' });
      this.enter('find-drawer', 'find-drawer');
      return;
    }
    if (this.state === 'keypad') {
      if (id === 'digit' && value && this.code.length < 4) {
        this.code += value;
        return;
      }
      if (id === 'clear-code') {
        this.code = '';
        return;
      }
      if (id === 'submit-code') {
        if (this.code !== '0317') {
          this.code = '';
          this.callbacks.sendCue('impact');
          this.audio.playSting(0.35);
          this.callbacks.showNotice('密碼錯誤。牆上照片背面的死亡時間是 03：17。');
          this.callbacks.sendScreen('keypad-0317');
          return;
        }
        this.setVisual({ drawer: 'open' });
        this.audio.playStatic();
        this.callbacks.sendCue('whisper');
        this.enter('tape-one', 'tape-warning-one');
        return;
      }
    }
    if (this.state === 'tape-one' && id === 'continue') {
      this.audio.playStatic();
      this.enter('tape-two', 'tape-warning-two');
      return;
    }
    if (this.state === 'tape-two' && id === 'continue') {
      this.audio.setTension(0.72);
      this.audio.playKnock();
      this.setVisual({ door: 'ready', footsteps: true });
      this.enter('find-door', 'find-door');
      return;
    }
    if (this.state === 'door-choice' && id === 'choose-open') {
      this.setVisual({ door: 'shadow', footsteps: false });
      this.callbacks.setFrame(2);
      this.audio.playDoor();
      this.audio.setTension(1);
      this.enter('open-scare');
      return;
    }
    if (this.state === 'door-choice' && id === 'choose-seal') {
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
            this.audio.playSting(0.55);
            this.callbacks.sendCue('impact');
            this.enter('window-opened', 'window-opened');
          },
        };
      case 'find-portrait':
        return {
          target: PORTRAIT_TARGET,
          prompt: '按「擺正照片」',
          hint: '家庭照掛在牆面中央，門的左邊。',
          activate: () => {
            this.setVisual({ portrait: 'changed' });
            this.callbacks.setFrame(1);
            this.audio.playSting(0.48);
            this.callbacks.sendCue('whisper');
            this.enter('portrait-changed', 'portrait-changed');
          },
        };
      case 'find-drawer':
        return {
          target: DRAWER_TARGET,
          prompt: '按「檢查抽屜」',
          hint: '抽屜在畫面左下方的矮櫃。',
          activate: () => this.enter('keypad', 'keypad-0317'),
        };
      case 'find-door':
        return {
          target: DOOR_TARGET,
          prompt: '按「握住鑰匙」',
          hint: '房門在畫面右側。腳印正往那裡移動。',
          activate: () => {
            this.audio.playFootsteps();
            this.callbacks.sendCue('ring');
            this.enter('door-choice', 'door-choice');
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
            this.enter('sealed-scare');
          },
        };
      default:
        return null;
    }
  }

  private isLookingAt(direction: Direction3, target: THREE.Vector3): boolean {
    const targetDirection = target.clone().sub(this.origin).normalize();
    const sample = new THREE.Vector3(...direction).normalize();
    return sample.dot(targetDirection) >= Math.cos(THREE.MathUtils.degToRad(23));
  }

  private enter(state: StoryState, screen?: StoryScreenId): void {
    this.state = state;
    this.stateSeconds = 0;
    this.hintPlayed = false;
    this.callbacks.setPrompt(null);
    if (screen) this.callbacks.sendScreen(screen);
  }

  private setVisual(patch: Partial<StoryVisualState>): void {
    this.visual = { ...this.visual, ...patch };
    this.callbacks.setVisual(this.visual);
  }

  private finish(ending: StoryEnding): void {
    this.callbacks.setJumpscareVisible(false);
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
