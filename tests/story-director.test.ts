import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostAudioEngine } from '../src/host/audio';
import { StoryDirector, type StoryVisualState } from '../src/host/story-director';
import type { ControllerCueId } from '../src/shared/protocol';
import type { StoryScreenId } from '../src/shared/story';

const ORIGIN = new THREE.Vector3(0, 1.6, 0);
const TARGETS = {
  window: new THREE.Vector3(-2.2, 1.55, -3.3),
  portrait: new THREE.Vector3(0.55, 1.65, -3.4),
  drawer: new THREE.Vector3(-2.15, 0.72, -3.25),
  door: new THREE.Vector3(2.05, 1.45, -3.35),
  sealChoice: new THREE.Vector3(-1.35, 1.2, -3.35),
  openChoice: new THREE.Vector3(1.35, 1.2, -3.35),
};

function directionTo(target: THREE.Vector3): [number, number, number] {
  const direction = target.clone().sub(ORIGIN).normalize();
  return [direction.x, direction.y, direction.z];
}

function createHarness() {
  const screens: StoryScreenId[] = [];
  const cues: ControllerCueId[] = [];
  const visuals: StoryVisualState[] = [];
  const endings: string[] = [];
  const faceStates: boolean[] = [];
  const photoStates: string[] = [];
  const tapeStates: string[] = [];
  const listeningStates: boolean[] = [];
  const effects: string[] = [];
  const audio = {
    startScore: vi.fn(),
    stopScore: vi.fn(),
    setTension: vi.fn(),
    playSting: vi.fn(),
    playDoor: vi.fn(),
    playJumpscare: vi.fn(),
    playKnock: vi.fn(),
    playFootsteps: vi.fn(),
    playThunder: vi.fn(),
    playStatic: vi.fn(),
  } as unknown as HostAudioEngine;
  const director = new StoryDirector(ORIGIN, audio, {
    sendScreen: (screen) => screens.push(screen),
    sendCue: (cue) => cues.push(cue),
    setFrame: vi.fn(),
    setJumpscareVisible: (visible) => faceStates.push(visible),
    setVisual: (state) => visuals.push({ ...state }),
    setPrompt: vi.fn(),
    setCodeDigits: vi.fn(),
    setChoiceFocus: vi.fn(),
    setPhotoInspection: (state) => photoStates.push(state),
    setTapePlayback: (state) => tapeStates.push(state),
    setDoorListening: (active) => listeningStates.push(active),
    setCinematicChromeHidden: vi.fn(),
    triggerManifestation: (effect) => effects.push(effect),
    showNotice: vi.fn(),
    onEnding: (ending) => endings.push(ending),
    onRestart: vi.fn(),
  });
  const activate = (target: THREE.Vector3) => {
    // 所有可瞄準物件都會先讓角色台詞播完；7.5 秒涵蓋目前最長的互動等待。
    director.update(7.5, null, false);
    const direction = directionTo(target);
    director.update(0.016, direction, false);
    director.update(0.016, direction, true);
    director.update(0.016, direction, false);
  };
  const press = (target?: THREE.Vector3) => {
    const direction = target ? directionTo(target) : null;
    director.update(0.016, direction, false);
    director.update(0.016, direction, true);
    director.update(0.016, direction, false);
  };
  return {
    director,
    screens,
    cues,
    visuals,
    endings,
    faceStates,
    photoStates,
    tapeStates,
    listeningStates,
    effects,
    audio,
    activate,
    press,
  };
}

afterEach(() => vi.useRealTimers());

describe('StoryDirector 407 chapter', () => {
  it('plays the investigation, accepts 0317, and completes the sealed ending', () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const { director, screens, cues, visuals, endings, photoStates, activate } = harness;

    director.start();
    expect(screens.at(-1)).toBe('prologue');
    director.update(10.2, null, false);
    expect(screens.at(-1)).toBe('incoming-407');
    expect(cues.filter((cue) => cue === 'ring')).toHaveLength(1);
    director.update(5.6, null, false);
    expect(cues.filter((cue) => cue === 'ring')).toHaveLength(2);

    director.handleStoryAction('answer');
    director.handleStoryAction('continue');
    activate(TARGETS.window);
    expect(screens.at(-1)).toBe('window-opened');
    expect(visuals.at(-1)?.window).toBe('broken');

    director.handleStoryAction('continue');
    activate(TARGETS.portrait);
    expect(screens.at(-1)).toBe('portrait-inspect-front');
    expect(photoStates.at(-1)).toBe('front');
    director.handleStoryAction('continue');
    expect(screens.at(-1)).toBe('portrait-inspect-back');
    expect(photoStates.at(-1)).toBe('back');
    director.handleStoryAction('continue');
    expect(screens.at(-1)).toBe('portrait-changed');
    expect(photoStates.at(-1)).toBe('hidden');

    director.handleStoryAction('continue');
    activate(TARGETS.drawer);
    expect(screens.at(-1)).toBe('keypad-0317');
    for (const digit of ['0', '3', '1', '7']) director.handleStoryAction('digit', digit);
    expect(director.enteredCode).toBe('0317');
    director.handleStoryAction('submit-code');
    expect(screens.at(-1)).toBe('tape-warning-one');

    director.handleStoryAction('continue');
    director.handleStoryAction('continue');
    activate(TARGETS.door);
    expect(screens.at(-1)).toBe('door-listen');
    director.handleStoryAction('continue');
    expect(screens.at(-1)).toBe('door-choice');
    director.handleStoryAction('choose-seal');
    activate(TARGETS.portrait);
    activate(TARGETS.window);
    activate(TARGETS.door);
    director.update(4.35, null, false);

    expect(screens.at(-1)).toBe('ending-sealed');
    expect(endings).toEqual(['sealed']);
    expect(visuals.at(-1)).toMatchObject({ window: 'sealed', portrait: 'sealed', door: 'sealed' });
  });

  it('can complete every phone-facing step with the same central button', () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const { director, screens, endings, activate, press } = harness;

    director.start();
    director.update(10.2, null, false);
    press(); // 接聽
    director.update(10.2, null, false);
    press(); // 掛斷並查看
    activate(TARGETS.window);
    director.update(6.5, null, false);
    press(); // 繼續點交
    activate(TARGETS.portrait);
    director.update(4.6, null, false);
    press(); // 翻到照片背面
    director.update(7.8, null, false);
    press(); // 把照片放回牆上
    director.update(6.6, null, false);
    press(); // 查看抽屜
    activate(TARGETS.drawer);
    press();
    press();
    press();
    press(); // 依序輸入 0317
    expect(director.enteredCode).toBe('0317');
    director.update(0.65, null, false);
    expect(screens.at(-1)).toBe('tape-warning-one');
    director.update(14.5, null, false);
    press();
    director.update(16, null, false);
    press();
    activate(TARGETS.door);
    expect(screens.at(-1)).toBe('door-listen');
    director.update(8.5, null, false);
    press();
    director.update(6.8, null, false);
    press(TARGETS.sealChoice);
    activate(TARGETS.portrait);
    activate(TARGETS.window);
    activate(TARGETS.door);
    director.update(4.35, null, false);

    expect(endings).toEqual(['sealed']);
    expect(screens.at(-1)).toBe('ending-sealed');
  });

  it('ignores early central presses until the current spoken line has time to finish', () => {
    const harness = createHarness();
    const { director, screens, press } = harness;

    director.start();
    director.update(10.2, null, false);
    press();
    expect(screens.at(-1)).toBe('call-window');

    director.update(3, null, false);
    press();
    expect(screens.at(-1)).toBe('call-window');
    director.update(7.2, null, false);
    press();
    expect(screens.at(-1)).toBe('find-window');

    press(TARGETS.window);
    expect(screens.at(-1)).toBe('find-window');
    director.update(4.6, null, false);
    press(TARGETS.window);
    expect(screens.at(-1)).toBe('window-opened');
  });

  it('rejects a wrong code and triggers both window and open-door scares', () => {
    const harness = createHarness();
    const { director, screens, faceStates, endings, activate, audio } = harness;

    director.start();
    director.update(10.2, null, false);
    director.handleStoryAction('answer');
    director.handleStoryAction('continue');
    activate(TARGETS.window);
    expect(faceStates.at(-1)).toBe(true);
    expect(audio.playJumpscare).toHaveBeenCalledTimes(1);
    director.handleStoryAction('continue');
    activate(TARGETS.portrait);
    director.handleStoryAction('continue');
    director.handleStoryAction('continue');
    director.handleStoryAction('continue');
    activate(TARGETS.drawer);
    for (const digit of ['1', '1', '1', '1']) director.handleStoryAction('digit', digit);
    director.handleStoryAction('submit-code');
    expect(director.enteredCode).toBe('');
    expect(screens.at(-1)).toBe('keypad-0317');

    for (const digit of ['0', '3', '1', '7']) director.handleStoryAction('digit', digit);
    director.handleStoryAction('submit-code');
    director.handleStoryAction('continue');
    director.handleStoryAction('continue');
    activate(TARGETS.door);
    director.handleStoryAction('continue');
    director.handleStoryAction('choose-open');
    director.update(2.2, null, false);
    expect(faceStates.at(-1)).toBe(true);
    expect(audio.playJumpscare).toHaveBeenCalledTimes(2);
    director.update(2.5, null, false);
    expect(endings).toEqual(['open']);
    expect(screens.at(-1)).toBe('ending-open');
  });

  it('stages the tape, peripheral scares, and door-listening pause before the choice', () => {
    const harness = createHarness();
    const { director, screens, tapeStates, listeningStates, effects, activate } = harness;

    director.start();
    director.update(10.2, null, false);
    director.handleStoryAction('answer');
    director.handleStoryAction('continue');
    activate(TARGETS.window);
    director.handleStoryAction('continue');
    activate(TARGETS.portrait);
    director.handleStoryAction('continue');
    director.update(2.3, null, false);
    expect(effects).toContain('shadow-left');
    director.handleStoryAction('continue');
    director.handleStoryAction('continue');
    activate(TARGETS.drawer);
    for (const digit of ['0', '3', '1', '7']) director.handleStoryAction('digit', digit);
    director.handleStoryAction('submit-code');
    expect(tapeStates.at(-1)).toBe('warning-one');
    director.update(3.7, null, false);
    expect(effects.at(-1)).toBe('shadow-left');
    director.handleStoryAction('continue');
    expect(tapeStates.at(-1)).toBe('warning-two');
    director.update(4.1, null, false);
    expect(effects).toContain('flicker');
    expect(effects.at(-1)).toBe('shadow-right');
    director.handleStoryAction('continue');
    expect(tapeStates.at(-1)).toBe('hidden');

    activate(TARGETS.door);
    expect(screens.at(-1)).toBe('door-listen');
    expect(listeningStates.at(-1)).toBe(true);
    director.update(4.75, null, false);
    expect(effects).toContain('flicker');
    expect(effects).toContain('shadow-left');
    director.update(3.75, null, false);
    harness.press();
    expect(screens.at(-1)).toBe('door-choice');
    expect(listeningStates.at(-1)).toBe(false);
  });
});
