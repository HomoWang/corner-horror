import type { ControllerCueId } from '../shared/protocol';
import {
  loadAudioSamples,
  playAudioSample,
  type AudioSampleId,
} from '../shared/audio-assets';

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  const browserWindow = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? browserWindow.webkitAudioContext ?? null;
}

export class ControllerAudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceSources: (OscillatorNode | AudioBufferSourceNode)[] = [];
  private readonly samples = new Map<AudioSampleId, AudioBuffer>();
  private sampleLoadPromise: Promise<void> | null = null;
  private ambienceRequested = false;
  private pendingCues: ControllerCueId[] = [];

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
      void this.loadSamples();
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
    if (!this.context || this.context.state !== 'running') {
      if (id === 'ambience-stop') {
        this.pendingCues = this.pendingCues.filter((cue) => cue !== 'ambience-start');
        return;
      }
      if (id !== 'ambience-start' || !this.pendingCues.includes(id)) this.pendingCues.push(id);
      if (this.pendingCues.length > 8) this.pendingCues.shift();
      return;
    }
    if (id === 'ambience-start') this.startAmbience();
    if (id === 'ambience-stop') this.stopAmbience();
    if (id === 'ring') this.playRing();
    if (id === 'whisper') this.playWhisper();
    if (id === 'impact') this.playImpact();
    if (id === 'jumpscare') this.playJumpscare();
  }

  private playRing(): void {
    const context = this.context!;
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
  }

  private loadSamples(): Promise<void> {
    if (!this.context) return Promise.resolve();
    if (!this.sampleLoadPromise) {
      this.sampleLoadPromise = loadAudioSamples(this.context).then((samples) => {
        for (const [id, buffer] of samples) this.samples.set(id, buffer);
        if (this.ambienceRequested && (this.samples.has('score') || this.samples.has('ambience'))) {
          this.stopAmbienceSources();
          this.startAmbience();
        }
      });
    }
    return this.sampleLoadPromise;
  }
}
