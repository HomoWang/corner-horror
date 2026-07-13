import * as THREE from 'three';
import type { ControllerCueId } from '../shared/protocol';
import { ScriptedEventEngine, type Direction3, type ScriptedEventDefinition } from '../shared/event-engine';
import type { SceneActors } from './scene';
import type { HostAudioEngine } from './audio';

function directionTo(position: THREE.Vector3, origin: THREE.Vector3): Direction3 {
  const direction = position.clone().sub(origin).normalize();
  return [direction.x, direction.y, direction.z];
}

export class HorrorDirector {
  private readonly engine: ScriptedEventEngine;
  private portraitFlashSeconds = 0;
  private endCountdownSeconds: number | null = null;

  constructor(
    private readonly actors: SceneActors,
    private readonly origin: THREE.Vector3,
    private readonly audio: HostAudioEngine,
    private readonly sendControllerCue: (id: ControllerCueId) => void,
    private readonly setCinematicFrame: (frame: number) => void,
    private readonly setJumpscareVisible: (visible: boolean) => void,
    private readonly onComplete: () => void,
  ) {
    const script: ScriptedEventDefinition[] = [
      { id: 'phone-call', trigger: { kind: 'time', afterMs: 4_000 } },
      {
        id: 'portrait-disturbance',
        requires: ['phone-call'],
        trigger: {
          kind: 'look',
          direction: directionTo(actors.portrait.position, origin),
          maxAngleDeg: 12,
          dwellMs: 650,
        },
      },
      { id: 'empty-corner-ready', trigger: { kind: 'time', afterMs: 9_000 } },
      {
        id: 'jumpscare',
        requires: ['empty-corner-ready'],
        trigger: {
          kind: 'look',
          direction: directionTo(actors.silhouette.position, origin),
          maxAngleDeg: 20,
          dwellMs: 90,
        },
      },
      { id: 'action-response', requires: ['phone-call'], trigger: { kind: 'action' } },
    ];
    this.engine = new ScriptedEventEngine(script);
    this.reset();
  }

  start(): void {
    this.reset();
    this.engine.start();
    this.audio.startScore();
    this.audio.setTension(0.15);
    this.sendControllerCue('ambience-start');
  }

  reset(): void {
    this.engine.reset();
    this.actors.silhouette.visible = false;
    this.portraitFlashSeconds = 0;
    this.endCountdownSeconds = null;
    this.setCinematicFrame(0);
    this.setJumpscareVisible(false);
    this.actors.portrait.material.emissive.setHex(0x000000);
    this.actors.portrait.material.emissiveIntensity = 0;
    this.audio.setTension(0);
    this.audio.stopScore();
    this.sendControllerCue('ambience-stop');
  }

  update(deltaSeconds: number, direction: Direction3 | null, actionPressed: boolean): void {
    if (this.portraitFlashSeconds > 0) {
      this.portraitFlashSeconds = Math.max(0, this.portraitFlashSeconds - deltaSeconds);
      const amount = this.portraitFlashSeconds / 1.2;
      this.actors.portrait.material.emissiveIntensity = amount * 1.6;
      if (this.portraitFlashSeconds === 0) {
        this.actors.portrait.material.emissive.setHex(0x000000);
        this.setCinematicFrame(0);
      }
    }

    if (this.endCountdownSeconds !== null) {
      this.endCountdownSeconds = Math.max(0, this.endCountdownSeconds - deltaSeconds);
      if (this.endCountdownSeconds === 0) {
        this.endCountdownSeconds = null;
        this.setJumpscareVisible(false);
        this.setCinematicFrame(0);
        this.audio.setTension(0);
        this.audio.stopScore();
        this.sendControllerCue('ambience-stop');
        this.onComplete();
      }
      return;
    }

    const events = this.engine.update(deltaSeconds * 1000, { direction, actionPressed });
    for (const event of events) this.apply(event);
  }

  private apply(event: string): void {
    switch (event) {
      case 'phone-call':
        this.sendControllerCue('ring');
        this.audio.setTension(0.35);
        break;
      case 'portrait-disturbance':
        this.portraitFlashSeconds = 1.2;
        this.actors.portrait.material.emissive.setHex(0x8a0000);
        this.actors.portrait.material.emissiveIntensity = 1.6;
        this.setCinematicFrame(1);
        this.sendControllerCue('whisper');
        this.audio.playSting(0.45);
        break;
      case 'empty-corner-ready':
        this.actors.silhouette.visible = false;
        this.setCinematicFrame(0);
        this.audio.setTension(0.72);
        this.audio.playDoor();
        break;
      case 'jumpscare':
        this.actors.silhouette.visible = false;
        this.setCinematicFrame(3);
        this.setJumpscareVisible(true);
        this.endCountdownSeconds = 2.1;
        this.sendControllerCue('jumpscare');
        this.audio.playJumpscare();
        this.audio.setTension(1);
        break;
      case 'action-response':
        this.sendControllerCue('whisper');
        break;
    }
  }
}
