import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  parseVideoStoryManifest,
  videoStoryChoiceSide,
  type VideoStoryManifest,
} from '../src/shared/video-story';

function validManifest(): VideoStoryManifest {
  return {
    version: 1,
    status: 'in-production',
    defaults: { aspectRatio: '16:9', fps: 24, preload: 'auto' },
    entry: 'opening',
    nodes: {
      opening: {
        status: 'ready',
        video: 'opening.mp4',
        durationHintSeconds: 8,
        next: 'choice',
        cues: [{ at: 2.2, audio: 'ring' }],
      },
      choice: {
        status: 'ready',
        video: 'choice.mp4',
        durationHintSeconds: 8,
        choice: {
          timeoutSeconds: 8,
          input: 'aim-and-central-button',
          options: [
            { id: 'stay', screenSide: 'left', label: 'Stay', next: 'safe' },
            { id: 'open', screenSide: 'right', label: 'Open', next: 'caught' },
          ],
        },
        cues: [],
      },
      safe: {
        status: 'awaiting-generation',
        video: 'safe.mp4',
        durationHintSeconds: 12,
        ending: 'safe',
        cues: [],
      },
      caught: {
        status: 'awaiting-generation',
        video: 'caught.mp4',
        durationHintSeconds: 12,
        ending: 'caught',
        cues: [{ at: 11.8, audio: 'jumpscare', haptic: 'long' }],
      },
    },
  };
}

describe('video story manifest', () => {
  it('keeps the current demo path playable and the unfinished branch explicit', () => {
    const raw = JSON.parse(
      readFileSync(new URL('../public/assets/video-pilot/story-graph.json', import.meta.url), 'utf8'),
    ) as unknown;
    const manifest = parseVideoStoryManifest(raw);
    expect(manifest.nodes.incoming_call?.status).toBe('ready');
    expect(manifest.nodes.approach_phone?.status).toBe('ready');
    expect(manifest.nodes.door_threshold?.status).toBe('ready');
    expect(manifest.nodes.slam_door_1?.status).toBe('ready');
    expect(manifest.nodes.slam_door_2?.status).toBe('ready');
    expect(manifest.nodes.freeze_1?.status).toBe('awaiting-generation');
  });

  it('accepts a connected graph and preserves production statuses', () => {
    const manifest = parseVideoStoryManifest(validManifest());
    expect(manifest.entry).toBe('opening');
    expect(manifest.nodes.opening?.status).toBe('ready');
    expect(manifest.nodes.choice?.choice?.options.map((option) => option.screenSide)).toEqual([
      'left',
      'right',
    ]);
  });

  it('rejects broken references, cues outside the clip, and one-sided choices', () => {
    const brokenReference = validManifest();
    brokenReference.nodes.opening!.next = 'missing';
    expect(() => parseVideoStoryManifest(brokenReference)).toThrow(/missing node/);

    const lateCue = validManifest();
    lateCue.nodes.opening!.cues[0]!.at = 9;
    expect(() => parseVideoStoryManifest(lateCue)).toThrow(/within the node duration/);

    const oneSided = validManifest();
    oneSided.nodes.choice!.choice!.options[1]!.screenSide = 'left';
    expect(() => parseVideoStoryManifest(oneSided)).toThrow(/both a left and right/);
  });

  it('maps screen aim to a choice without reacting in the centre dead zone', () => {
    expect(videoStoryChoiceSide(-0.7)).toBe('left');
    expect(videoStoryChoiceSide(0.7)).toBe('right');
    expect(videoStoryChoiceSide(0.1)).toBeNull();
    expect(videoStoryChoiceSide(null)).toBeNull();
  });
});
