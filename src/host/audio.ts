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

export class HostAudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private readonly samples = new Map<AudioSampleId, AudioBuffer>();
  private sampleLoadPromise: Promise<void> | null = null;
  private scoreGain: GainNode | null = null;
  private scoreSources: AudioBufferSourceNode[] = [];
  private scoreRequested = false;

  get started(): boolean {
    return this.context?.state === 'running';
  }

  async start(): Promise<boolean> {
    try {
      const Constructor = audioContextConstructor();
      if (!Constructor) return false;
      if (!this.context) {
        this.context = new Constructor();
        const compressor = this.context.createDynamicsCompressor();
        compressor.threshold.value = -20;
        compressor.knee.value = 18;
        compressor.ratio.value = 5;
        compressor.attack.value = 0.012;
        compressor.release.value = 0.35;
        const master = this.context.createGain();
        master.gain.value = 0.9;
        master.connect(compressor).connect(this.context.destination);
        this.masterGain = master;
        this.createAmbience(this.context, master);
      }
      if (this.context.state === 'suspended') await this.context.resume();
      void this.loadSamples();
      if (this.scoreRequested) this.startSampleScore();
      return this.context.state === 'running';
    } catch {
      return false;
    }
  }

  startScore(): void {
    this.scoreRequested = true;
    if (!this.context || this.context.state !== 'running') return;
    this.startSampleScore();
    void this.loadSamples();
  }

  stopScore(): void {
    this.scoreRequested = false;
    if (!this.context || !this.scoreGain) return;
    const now = this.context.currentTime;
    const gain = this.scoreGain;
    const sources = this.scoreSources;
    gain.gain.cancelScheduledValues(now);
    gain.gain.setTargetAtTime(0.0001, now, 0.28);
    for (const source of sources) source.stop(now + 1.5);
    this.scoreGain = null;
    this.scoreSources = [];
  }

  playDoor(): void {
    if (!this.context || this.context.state !== 'running') return;
    const buffer = this.samples.get('door');
    if (buffer) {
      playAudioSample(this.context, this.masterGain ?? this.context.destination, buffer, 0.8);
      return;
    }
    this.playSting(0.25);
  }

  playKnock(): void {
    if (!this.context || this.context.state !== 'running') return;
    const context = this.context;
    const output = this.masterGain ?? context.destination;
    const start = context.currentTime;
    for (const offset of [0, 0.34, 0.72]) {
      const oscillator = context.createOscillator();
      const filter = context.createBiquadFilter();
      const gain = context.createGain();
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(92, start + offset);
      oscillator.frequency.exponentialRampToValueAtTime(42, start + offset + 0.14);
      filter.type = 'lowpass';
      filter.frequency.value = 270;
      gain.gain.setValueAtTime(0.0001, start + offset);
      gain.gain.exponentialRampToValueAtTime(0.3, start + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.22);
      oscillator.connect(filter).connect(gain).connect(output);
      oscillator.start(start + offset);
      oscillator.stop(start + offset + 0.24);
    }
  }

  playFootsteps(): void {
    if (!this.context || this.context.state !== 'running') return;
    const context = this.context;
    const output = this.masterGain ?? context.destination;
    const start = context.currentTime;
    for (let step = 0; step < 5; step++) {
      const at = start + step * 0.48;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const pan = context.createStereoPanner();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(68 - step * 4, at);
      oscillator.frequency.exponentialRampToValueAtTime(31, at + 0.2);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(0.11 + step * 0.025, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.3);
      pan.pan.value = -0.65 + step * 0.28;
      oscillator.connect(gain).connect(pan).connect(output);
      oscillator.start(at);
      oscillator.stop(at + 0.32);
    }
  }

  playThunder(): void {
    if (!this.context || this.context.state !== 'running') return;
    const context = this.context;
    const duration = 1.8;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) {
      const decay = Math.exp((-5 * index) / data.length);
      data[index] = (Math.random() * 2 - 1) * decay;
    }
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    filter.type = 'lowpass';
    filter.frequency.value = 190;
    gain.gain.value = 0.5;
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.masterGain ?? context.destination);
    source.start();
  }

  playStatic(): void {
    if (!this.context || this.context.state !== 'running') return;
    const context = this.context;
    const duration = 0.9;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < data.length; index++) data[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const now = context.currentTime;
    filter.type = 'bandpass';
    filter.frequency.value = 1350;
    filter.Q.value = 0.85;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.13, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    source.buffer = buffer;
    source.connect(filter).connect(gain).connect(this.masterGain ?? context.destination);
    source.start();
  }

  playJumpscare(): void {
    if (!this.context || this.context.state !== 'running') return;
    const output = this.masterGain ?? this.context.destination;
    const scream = this.samples.get('jumpscare');
    const impact = this.samples.get('impact');
    if (impact) playAudioSample(this.context, output, impact, 0.92);
    if (scream) playAudioSample(this.context, output, scream, 1.08);
    if (!scream) this.playSting(1.5);
  }

  setTension(amount: number): void {
    if (!this.context || !this.ambienceGain) return;
    const level = 0.055 + Math.min(1, Math.max(0, amount)) * 0.105;
    this.ambienceGain.gain.setTargetAtTime(level, this.context.currentTime, 0.9);
  }

  playSting(intensity = 1): void {
    if (!this.context || this.context.state !== 'running') return;
    const context = this.context;
    const impact = this.samples.get('impact');
    if (impact) {
      playAudioSample(context, this.masterGain ?? context.destination, impact, 0.28 * intensity);
    }
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = 'sawtooth';
    oscillator.frequency.setValueAtTime(170, now);
    oscillator.frequency.exponentialRampToValueAtTime(32, now + 0.9);
    filter.type = 'lowpass';
    filter.frequency.value = 650;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.12 * Math.min(1.5, intensity), now + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);
    oscillator.connect(filter).connect(gain).connect(this.masterGain ?? context.destination);
    oscillator.start(now);
    oscillator.stop(now + 1.1);

    const noiseDuration = 0.75;
    const noiseBuffer = context.createBuffer(1, context.sampleRate * noiseDuration, context.sampleRate);
    const noiseData = noiseBuffer.getChannelData(0);
    for (let index = 0; index < noiseData.length; index++) noiseData[index] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    const noiseFilter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = noiseBuffer;
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.setValueAtTime(1200, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(90, now + noiseDuration);
    noiseGain.gain.setValueAtTime(0.0001, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.075 * Math.min(1.4, intensity), now + 0.018);
    noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDuration);
    noise.connect(noiseFilter).connect(noiseGain).connect(this.masterGain ?? context.destination);
    noise.start(now);
  }

  private loadSamples(): Promise<void> {
    if (!this.context) return Promise.resolve();
    if (!this.sampleLoadPromise) {
      this.sampleLoadPromise = loadAudioSamples(this.context).then((samples) => {
        for (const [id, buffer] of samples) this.samples.set(id, buffer);
        if (this.scoreRequested) this.startSampleScore();
      });
    }
    return this.sampleLoadPromise;
  }

  private startSampleScore(): void {
    if (!this.context || this.context.state !== 'running' || this.scoreGain) return;
    const score = this.samples.get('score');
    const ambience = this.samples.get('ambience');
    if (!score && !ambience) return;

    const context = this.context;
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.62, context.currentTime + 2.2);
    gain.connect(this.masterGain ?? context.destination);
    this.scoreGain = gain;
    if (score) this.scoreSources.push(playAudioSample(context, gain, score, 0.52, true));
    if (ambience) this.scoreSources.push(playAudioSample(context, gain, ambience, 0.34, true));
  }

  private createAmbience(context: AudioContext, output: AudioNode): void {
    const ambience = context.createGain();
    const roomFilter = context.createBiquadFilter();
    ambience.gain.value = 0.055;
    roomFilter.type = 'lowpass';
    roomFilter.frequency.value = 620;
    roomFilter.Q.value = 0.75;
    ambience.connect(roomFilter).connect(output);
    this.ambienceGain = ambience;

    // 互相拍頻的低頻與不協和泛音，提供持續但不規則的「房間在呼吸」感。
    for (const [frequency, level, type] of [
      [35.8, 0.56, 'sine'],
      [40.6, 0.43, 'sine'],
      [54.9, 0.18, 'triangle'],
      [72.4, 0.055, 'sawtooth'],
      [151.7, 0.022, 'triangle'],
      [158.1, 0.018, 'triangle'],
    ] as const) {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = (Math.random() - 0.5) * 8;
      gain.gain.value = level;
      oscillator.connect(gain).connect(ambience);
      oscillator.start();
    }

    const duration = 4;
    const buffer = context.createBuffer(1, context.sampleRate * duration, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < channel.length; index++) channel[index] = Math.random() * 2 - 1;
    const noise = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const noiseGain = context.createGain();
    noise.buffer = buffer;
    noise.loop = true;
    filter.type = 'bandpass';
    filter.frequency.value = 235;
    filter.Q.value = 0.55;
    noiseGain.gain.value = 0.2;
    noise.connect(filter).connect(noiseGain).connect(ambience);
    noise.start();

    const movement = context.createOscillator();
    const movementDepth = context.createGain();
    movement.type = 'sine';
    movement.frequency.value = 0.075;
    movementDepth.gain.value = 130;
    movement.connect(movementDepth).connect(filter.frequency);
    movement.start();

    const pulse = context.createOscillator();
    const pulseDepth = context.createGain();
    pulse.type = 'sine';
    pulse.frequency.value = 0.31;
    pulseDepth.gain.value = 0.025;
    pulse.connect(pulseDepth).connect(ambience.gain);
    pulse.start();
  }
}
