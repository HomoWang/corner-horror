import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import type { HostAudioEngine } from '../src/host/audio';
import { HorrorDirector } from '../src/host/horror-director';
import type { SceneActors } from '../src/host/scene';
import type { ControllerCueId } from '../src/shared/protocol';

function actor(position: [number, number, number]): SceneActors['portrait'] {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial());
  mesh.position.set(...position);
  return mesh;
}

describe('HorrorDirector jump scare', () => {
  it('keeps the corner empty, then triggers face and scream when the player turns toward it', () => {
    const origin = new THREE.Vector3(0, 1.6, 0);
    const actors: SceneActors = {
      portrait: actor([1, 1.6, -3]),
      silhouette: actor([2.4, 0.85, -2.7]),
    };
    const audio = {
      startScore: vi.fn(),
      stopScore: vi.fn(),
      setTension: vi.fn(),
      playSting: vi.fn(),
      playDoor: vi.fn(),
      playJumpscare: vi.fn(),
    } as unknown as HostAudioEngine;
    const cues: ControllerCueId[] = [];
    const faceStates: boolean[] = [];
    const director = new HorrorDirector(
      actors,
      origin,
      audio,
      (cue) => cues.push(cue),
      vi.fn(),
      (visible) => faceStates.push(visible),
      vi.fn(),
    );

    director.start();
    director.update(9, null, false);
    expect(actors.silhouette.visible).toBe(false);
    expect(audio.playDoor).toHaveBeenCalledOnce();
    expect(cues).not.toContain('jumpscare');

    const look = actors.silhouette.position.clone().sub(origin).normalize();
    director.update(0.1, [look.x, look.y, look.z], false);
    expect(faceStates.at(-1)).toBe(true);
    expect(audio.playJumpscare).toHaveBeenCalledOnce();
    expect(cues).toContain('jumpscare');
  });
});
