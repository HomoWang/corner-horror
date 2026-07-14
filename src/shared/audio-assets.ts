import { publicUrl } from './public-url';

export const AUDIO_SAMPLE_URLS = {
  score: publicUrl('assets/audio/horror-score-piano-horror.mp3'),
  ambience: publicUrl('assets/audio/horror-ambience.mp3'),
  ring: publicUrl('assets/audio/vintage-telephone-ring.mp3'),
  impact: publicUrl('assets/audio/cinematic-deep-impact.mp3'),
  door: publicUrl('assets/audio/scary-door-opening.mp3'),
  jumpscare: publicUrl('assets/audio/jumpscare-scream.mp3'),
  voiceWarning: publicUrl('assets/audio/voice/warning-dont-look.mp3'),
  voiceDoor: publicUrl('assets/audio/voice/door-mother.mp3'),
  voiceWrongSide: publicUrl('assets/audio/voice/wrong-side.mp3'),
} as const;

export type AudioSampleId = keyof typeof AUDIO_SAMPLE_URLS;

/** 載入並解碼單支樣本；失敗時丟出帶原因的錯誤，讓呼叫端能顯示診斷而非默默消音。 */
export async function loadAudioSample(context: AudioContext, id: AudioSampleId): Promise<AudioBuffer> {
  let response: Response;
  try {
    response = await fetch(AUDIO_SAMPLE_URLS[id]);
  } catch (error) {
    throw new Error(`fetch：${error instanceof Error ? error.message : String(error)}`);
  }
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.arrayBuffer();
  try {
    return await context.decodeAudioData(data);
  } catch (error) {
    throw new Error(`decode：${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function loadAudioSamples(context: AudioContext): Promise<Map<AudioSampleId, AudioBuffer>> {
  const results = await Promise.all(
    (Object.keys(AUDIO_SAMPLE_URLS) as AudioSampleId[]).map(async (id) => {
      try {
        return [id, await loadAudioSample(context, id)] as const;
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
