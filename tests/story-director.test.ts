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
    showNotice: vi.fn(),
    onEnding: (ending) => endings.push(ending),
    onRestart: vi.fn(),
  });
  const activate = (target: THREE.Vector3) => {
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
  return { director, screens, cues, visuals, endings, faceStates, audio, activate, press };
}

afterEach(() => vi.useRealTimers());

describe('StoryDirector 407 chapter', () => {
  it('plays the investigation, accepts 0317, and completes the sealed ending', () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const { director, screens, visuals, endings, activate } = harness;

    director.start();
    expect(screens.at(-1)).toBe('prologue');
    director.update(4.2, null, false);
    expect(screens.at(-1)).toBe('incoming-407');

    director.handleStoryAction('answer');
    director.handleStoryAction('continue');
    activate(TARGETS.window);
    expect(screens.at(-1)).toBe('window-opened');
    expect(visuals.at(-1)?.window).toBe('broken');

    director.handleStoryAction('continue');
    activate(TARGETS.portrait);
    expect(screens.at(-1)).toBe('portrait-changed');

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
    expect(screens.at(-1)).toBe('door-choice');
    director.handleStoryAction('choose-seal');
    activate(TARGETS.portrait);
    activate(TARGETS.window);
    activate(TARGETS.door);
    director.update(2.5, null, false);

    expect(screens.at(-1)).toBe('ending-sealed');
    expect(endings).toEqual(['sealed']);
    expect(visuals.at(-1)).toMatchObject({ window: 'sealed', portrait: 'sealed', door: 'sealed' });
  });

  it('can complete every phone-facing step with the same central button', () => {
    vi.useFakeTimers();
    const harness = createHarness();
    const { director, screens, endings, activate, press } = harness;

    director.start();
    director.update(4.2, null, false);
    press(); // 接聽
    press(); // 掛斷並查看
    activate(TARGETS.window);
    press(); // 繼續點交
    activate(TARGETS.portrait);
    press(); // 查看抽屜
    activate(TARGETS.drawer);
    press();
    press();
    press();
    press(); // 依序輸入 0317
    expect(director.enteredCode).toBe('0317');
    director.update(0.65, null, false);
    expect(screens.at(-1)).toBe('tape-warning-one');
    press();
    press();
    activate(TARGETS.door);
    press(TARGETS.sealChoice);
    activate(TARGETS.portrait);
    activate(TARGETS.window);
    activate(TARGETS.door);
    director.update(2.5, null, false);

    expect(endings).toEqual(['sealed']);
    expect(screens.at(-1)).toBe('ending-sealed');
  });

  it('rejects a wrong code and triggers both window and open-door scares', () => {
    const harness = createHarness();
    const { director, screens, faceStates, endings, activate, audio } = harness;

    director.start();
    director.update(4.2, null, false);
    director.handleStoryAction('answer');
    director.handleStoryAction('continue');
    activate(TARGETS.window);
    expect(faceStates.at(-1)).toBe(true);
    expect(audio.playJumpscare).toHaveBeenCalledTimes(1);
    director.handleStoryAction('continue');
    activate(TARGETS.portrait);
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
    director.handleStoryAction('choose-open');
    director.update(1.2, null, false);
    expect(faceStates.at(-1)).toBe(true);
    expect(audio.playJumpscare).toHaveBeenCalledTimes(2);
    director.update(2.2, null, false);
    expect(endings).toEqual(['open']);
    expect(screens.at(-1)).toBe('ending-open');
  });
});
