import type { ControllerCueId } from '../shared/protocol';
import {
  AUDIO_SAMPLE_URLS,
  loadAudioSample,
  playAudioSample,
  type AudioSampleId,
} from '../shared/audio-assets';

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  const browserWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

type VoiceCueId = 'voice-warning' | 'voice-door' | 'voice-wrong-side';
type VoiceSampleId = 'voiceWarning' | 'voiceDoor' | 'voiceWrongSide';

const VOICE_SAMPLE_IDS: readonly VoiceSampleId[] = ['voiceWarning', 'voiceDoor', 'voiceWrongSide'];
const VOICE_CUE_BY_SAMPLE: Record<VoiceSampleId, VoiceCueId> = {
  voiceWarning: 'voice-warning',
  voiceDoor: 'voice-door',
  voiceWrongSide: 'voice-wrong-side',
};

function isVoiceSampleId(id: AudioSampleId): id is VoiceSampleId {
  return (VOICE_SAMPLE_IDS as readonly AudioSampleId[]).includes(id);
}

export class ControllerAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceSources: (OscillatorNode | AudioBufferSourceNode)[] = [];
  private readonly samples = new Map<AudioSampleId, AudioBuffer>();
  private readonly samplePromises = new Map<AudioSampleId, Promise<AudioBuffer | null>>();
  private ambienceUpgradeWatched = false;
  private ambienceUsesSamples = false;
  private ambienceRequested = false;
  private pendingCues: ControllerCueId[] = [];
  private lastRingAt = Number.NEGATIVE_INFINITY;
  private lastReportedContextState: string | null = null;

  /** onDiagnostic 會收到人聲 cue 的 received / decoded / playing 等狀態，顯示在手機畫面上除錯。 */
  constructor(private readonly onDiagnostic: (line: string) => void = () => {}) {}

  async unlock(): Promise<boolean> {
    try {
      const Constructor = audioContextConstructor();
      if (!Constructor) return false;
      this.context ??= new Constructor();
      if (!this.master) {
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -18;
        compressor.knee.value = 16;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.008;
        compressor.release.value = 0.25;
        this.master = this.context.createGain();
        this.master.gain.value = 0.82;
        this.master.connect(compressor).connect(this.context.destination);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.reportContextState();
      this.loadSamples();
      if (this.context.state === 'running' && this.pendingCues.length > 0) {
        const pending = this.pendingCues.splice(0);
        for (const cue of pending) this.play(cue);
      }
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  play(id: ControllerCueId): void {
    if (id.startsWith('voice-')) {
      this.onDiagnostic(`${id} 已收到（ctx=${this.context?.state ?? 'none'}）`);
    }
    if (!this.context || this.context.state !== 'running') {
      if (id === 'ambience-stop') {
        this.pendingCues = this.pendingCues.filter((cue) => cue !== 'ambience-start');
        return;
      }
      if (id !== 'ambience-start' || !this.pendingCues.includes(id)) this.pendingCues.push(id);
      if (this.pendingCues.length > 8) this.pendingCues.shift();
      if (id.startsWith('voice-')) this.onDiagnostic(`${id} 已排入佇列，等待觸碰解鎖音訊`);
      return;
    }
    if (id === 'ambience-start') this.startAmbience();
    if (id === 'ambience-stop') this.stopAmbience();
    if (id === 'ring') this.playRing();
    if (id === 'whisper') this.playWhisper();
    if (id === 'impact') this.playImpact();
    if (id === 'voice-warning') this.playVoice(id, 'voiceWarning');
    if (id === 'voice-door') this.playVoice(id, 'voiceDoor');
    if (id === 'voice-wrong-side') this.playVoice(id, 'voiceWrongSide');
    if (id === 'jumpscare') this.playJumpscare();
  }

  /** 語音由 SpeechSynthesis 直接輸出；朗讀期間壓低 Web Audio，讓台詞不被配樂吃掉。 */
  setVoiceDucking(active: boolean): void {
    if (!this.context || !this.master) return;
    const now = this.context.currentTime;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setTargetAtTime(active ? 0.34 : 0.82, now, active ? 0.12 : 0.45);
  }

  private playRing(): void {
    const context = this.context!;
    if (context.currentTime - this.lastRingAt < 1) return;
    this.lastRingAt = context.currentTime;
    const start = context.currentTime;
    const output = this.master ?? context.destination;
    const sample = this.samples.get('ring');
    if (sample) {
      playAudioSample(context, output, sample, 0.92);
      navigator.vibrate?.([920, 380, 920, 380, 920]);
      return;
    }

    // 經典電話的 440/480 Hz 雙音，加上「長響、停頓」節奏，比提示嗶聲更像真的來電。
    for (let ring = 0; ring < 3; ring++) {
      const at = start + ring * 2.05;
      for (const [frequency, level] of [[440, 0.075], [480, 0.07], [960, 0.016]] as const) {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = frequency === 960 ? 'triangle' : 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(level, at + 0.025);
        gain.gain.setValueAtTime(level, at + 1.18);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 1.28);
        oscillator.connect(gain).connect(output);
        oscillator.start(at);
        oscillator.stop(at + 1.3);
      }
    }
    navigator.vibrate?.([1250, 800, 1250, 800, 1250]);
  }

  private playWhisper(): void {
    const context = this.context!;
    const duration = 1.8;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index++) channel[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const lowFormant = context.createBiquadFilter();
    const highFormant = context.createBiquadFilter();
    const lowGain = context.createGain();
    const highGain = context.createGain();
    const envelope = context.createGain();
    lowFormant.type = 'bandpass';
    lowFormant.frequency.value = 720;
    lowFormant.Q.value = 3.5;
    highFormant.type = 'bandpass';
    highFormant.frequency.value = 1850;
    highFormant.Q.value = 5;
    lowGain.gain.value = 0.7;
    highGain.gain.value = 0.32;
    const now = context.currentTime;
    envelope.gain.setValueAtTime(0.0001, now);
    envelope.gain.exponentialRampToValueAtTime(0.11, now + 0.18);
    envelope.gain.exponentialRampToValueAtTime(0.035, now + 0.75);
    envelope.gain.exponentialRampToValueAtTime(0.09, now + 1.05);
    envelope.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.buffer = buffer;
    source.connect(lowFormant).connect(lowGain).connect(envelope);
    source.connect(highFormant).connect(highGain).connect(envelope);
    envelope.connect(this.master ?? context.destination);
    source.start();
    navigator.vibrate?.([35, 80, 25]);
  }

  private playImpact(): void {
    const context = this.context!;
    const sample = this.samples.get('impact');
    if (sample) {
      playAudioSample(context, this.master ?? context.destination, sample, 0.9);
      navigator.vibrate?.([180, 40, 260]);
      return;
    }
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(95, now);
    oscillator.frequency.exponentialRampToValueAtTime(28, now + 0.65);
    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
    oscillator.connect(gain).connect(this.master ?? context.destination);
    oscillator.start(now);
    oscillator.stop(now + 0.72);
    navigator.vibrate?.([120, 50, 220]);
  }

  private playJumpscare(): void {
    const context = this.context!;
    const output = this.master ?? context.destination;
    const scream = this.samples.get('jumpscare');
    const impact = this.samples.get('impact');
    if (impact) playAudioSample(context, output, impact, 0.9);
    if (scream) playAudioSample(context, output, scream, 1.12);
    if (!scream) this.playImpact();
    navigator.vibrate?.([420, 35, 520]);
  }

  private playVoice(cue: VoiceCueId, id: VoiceSampleId): void {
    const context = this.context!;
    const sample = this.samples.get(id);
    if (!sample) {
      this.onDiagnostic(`${cue} 等待音檔下載／解碼…`);
      if (!this.pendingCues.includes(cue)) this.pendingCues.push(cue);
      void this.ensureSample(id).then((buffer) => {
        const pendingIndex = this.pendingCues.indexOf(cue);
        if (pendingIndex < 0) return;
        if (!buffer) {
          this.pendingCues.splice(pendingIndex, 1);
          this.onDiagnostic(`${cue} 放棄播放：音檔載入失敗`);
          return;
        }
        if (!this.context || this.context.state !== 'running') {
          // 留在佇列，下一次 unlock()（真實觸碰）會重播。
          this.onDiagnostic(`${cue} 已解碼，等待觸碰恢復音訊後播放`);
          return;
        }
        this.pendingCues.splice(pendingIndex, 1);
        this.playVoice(cue, id);
      });
      return;
    }
    const now = context.currentTime;
    // 只壓低 ambienceGain（配樂）；人聲走 master，不會被自己 duck 到。
    if (this.ambienceGain) {
      const restoreLevel = this.samples.has('score') || this.samples.has('ambience') ? 0.74 : 0.085;
      this.ambienceGain.gain.cancelScheduledValues(now);
      this.ambienceGain.gain.setTargetAtTime(0.18, now, 0.08);
      this.ambienceGain.gain.setTargetAtTime(restoreLevel, now + sample.duration + 0.15, 0.35);
    }
    playAudioSample(context, this.master ?? context.destination, sample, 1.18);
    this.onDiagnostic(`${cue} 播放中（${sample.duration.toFixed(1)} 秒）`);
  }

  private startAmbience(): void {
    this.ambienceRequested = true;
    const context = this.context!;
    const now = context.currentTime;
    if (this.ambienceGain) {
      this.ambienceGain.gain.cancelScheduledValues(now);
      this.ambienceGain.gain.setTargetAtTime(0.085, now, 0.6);
      return;
    }

    const score = this.samples.get('score');
    const sampleAmbience = this.samples.get('ambience');
    this.ambienceUsesSamples = Boolean(score || sampleAmbience);
    if (score || sampleAmbience) {
      const ambience = context.createGain();
      ambience.gain.setValueAtTime(0.0001, now);
      ambience.gain.exponentialRampToValueAtTime(0.74, now + 2.2);
      ambience.connect(this.master ?? context.destination);
      this.ambienceGain = ambience;
      if (score) this.ambienceSources.push(playAudioSample(context, ambience, score, 0.48, true));
      if (sampleAmbience) {
        this.ambienceSources.push(playAudioSample(context, ambience, sampleAmbience, 0.3, true));
      }
      return;
    }

    const ambience = context.createGain();
    const lowpass = context.createBiquadFilter();
    ambience.gain.setValueAtTime(0.0001, now);
    ambience.gain.exponentialRampToValueAtTime(0.085, now + 1.8);
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 430;
    lowpass.Q.value = 0.7;
    ambience.connect(lowpass).connect(this.master ?? context.destination);
    this.ambienceGain = ambience;

    for (const [frequency, level, type] of [
      [36.7, 0.46, 'sine'],
      [43.2, 0.32, 'sine'],
      [55.6, 0.11, 'triangle'],
      [73.9, 0.045, 'sawtooth'],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = (Math.random() - 0.5) * 9;
      gain.gain.value = level;
      oscillator.connect(gain).connect(ambience);
      oscillator.start();
      this.ambienceSources.push(oscillator);
    }

    const noiseDuration = 3;
    const noiseBuffer = context.createBuffer(1, context.sampleRate * noiseDuration, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseData.length; index++) noiseData[index] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = noiseBuffer;
    noise.loop = true;
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.value = 210;
    noiseFilter.Q.value = 0.55;
    noiseGain.gain.value = 0.15;
    noise.connect(noiseFilter).connect(noiseGain).connect(ambience);
    noise.start();
    this.ambienceSources.push(noise);

    const movement = context.createOscillator();
    const movementDepth = context.createGain();
    movement.type = 'sine';
    movement.frequency.value = 0.09;
    movementDepth.gain.value = 105;
    movement.connect(movementDepth).connect(noiseFilter.frequency);
    movement.start();
    this.ambienceSources.push(movement);
  }

  private stopAmbience(): void {
    this.ambienceRequested = false;
    this.stopAmbienceSources();
  }

  private stopAmbienceSources(): void {
    if (!this.context || !this.ambienceGain) return;
    const context = this.context;
    const now = context.currentTime;
    const gain = this.ambienceGain;
    const sources = this.ambienceSources;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.25);
    for (const source of sources) source.stop(now + 1.4);
    this.ambienceGain = null;
    this.ambienceSources = [];
    this.ambienceUsesSamples = false;
  }

  /** 每支樣本獨立下載＋解碼，完成一支就可用一支；人聲優先起跑，不再等全部背景資源。 */
  private loadSamples(): void {
    if (!this.context) return;
    for (const id of VOICE_SAMPLE_IDS) void this.ensureSample(id);
    for (const id of Object.keys(AUDIO_SAMPLE_URLS) as AudioSampleId[]) {
      if (!isVoiceSampleId(id)) void this.ensureSample(id);
    }
    if (!this.ambienceUpgradeWatched) {
      this.ambienceUpgradeWatched = true;
      // 兩支配樂都塵埃落定後，才把振盪器底噪升級成取樣配樂（維持舊行為：一次到位）。
      void Promise.allSettled([this.ensureSample('score'), this.ensureSample('ambience')]).then(() => {
        if (
          this.ambienceRequested &&
          !this.ambienceUsesSamples &&
          (this.samples.has('score') || this.samples.has('ambience'))
        ) {
          this.stopAmbienceSources();
          this.startAmbience();
        }
      });
    }
  }

  private ensureSample(id: AudioSampleId): Promise<AudioBuffer | null> {
    const existing = this.samplePromises.get(id);
    if (existing) return existing;
    const context = this.context;
    if (!context) return Promise.resolve(null);
    const promise = loadAudioSample(context, id).then(
      (buffer) => {
        this.samples.set(id, buffer);
        if (isVoiceSampleId(id)) {
          this.onDiagnostic(`${VOICE_CUE_BY_SAMPLE[id]} 已解碼（${buffer.duration.toFixed(1)} 秒）`);
        }
        return buffer;
      },
      (error: unknown) => {
        // 失敗不快取：下一次真實觸碰（unlock）或人聲 cue 會重試。
        this.samplePromises.delete(id);
        if (isVoiceSampleId(id)) {
          const reason = error instanceof Error ? error.message : String(error);
          this.onDiagnostic(`${VOICE_CUE_BY_SAMPLE[id]} 載入失敗：${reason}`);
        }
        return null;
      },
    );
    this.samplePromises.set(id, promise);
    return promise;
  }

  private reportContextState(): void {
    const state = this.context?.state ?? 'none';
    if (state === this.lastReportedContextState) return;
    this.lastReportedContextState = state;
    this.onDiagnostic(`AudioContext：${state}`);
  }
}
