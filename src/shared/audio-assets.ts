import { publicUrl } from './public-url';

export const AUDIO_SAMPLE_URLS = {
  score: publicUrl('assets/audio/horror-score-piano-horror.mp3'),
  ambience: publicUrl('assets/audio/horror-ambience.mp3'),
  ring: publicUrl('assets/audio/vintage-telephone-ring.mp3'),
  impact: publicUrl('assets/audio/cinematic-deep-impact.mp3'),
  door: publicUrl('assets/audio/scary-door-opening.mp3'),
  jumpscare: publicUrl('assets/audio/jumpscare-scream.mp3'),
} as const;

export type AudioSampleId = keyof typeof AUDIO_SAMPLE_URLS;

export async function loadAudioSamples(context: AudioContext): Promise<Map<AudioSampleId, AudioBuffer>> {
  const results = await Promise.all(
    (Object.entries(AUDIO_SAMPLE_URLS) as [AudioSampleId, string][]).map(async ([id, url]) => {
      try {
        const response = await fetch(url);
        if (!response.ok) return null;
        const data = await response.arrayBuffer();
        const buffer = await context.decodeAudioData(data);
        return [id, buffer] as const;
      } catch {
        return null;
      }
    }),
  );

  return new Map(results.filter((entry): entry is readonly [AudioSampleId, AudioBuffer] => entry !== null));
}

export function playAudioSample(
  context: AudioContext,
  output: AudioNode,
  buffer: AudioBuffer,
  level = 1,
  loop = false,
): AudioBufferSourceNode {
  const source = context.createBufferSource();
  const gain = context.createGain();
  source.buffer = buffer;
  source.loop = loop;
  gain.gain.value = level;
  source.connect(gain).connect(output);
  source.start();
  return source;
}
