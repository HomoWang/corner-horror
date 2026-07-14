import type { StoryScreenId } from '../shared/story';
import { NARRATION_CUES, voiceSettings, type NarrationRole } from '../shared/narration';

type VoiceDuckingCallback = (active: boolean) => void;

function preferredVoice(voices: SpeechSynthesisVoice[], role: NarrationRole): SpeechSynthesisVoice | null {
  const chinese = voices.filter((voice) => /^zh[-_]/i.test(voice.lang));
  if (chinese.length === 0) return null;
  const taiwan = chinese.filter((voice) => /zh[-_]TW/i.test(voice.lang));
  const pool = taiwan.length > 0 ? taiwan : chinese;
  const femaleNames = /ting|hanhan|meijia|huihui|xiaoxiao|雅婷|美佳|曉曉/i;
  if (role === 'xiaoyu' || role === 'entity') {
    return pool.find((voice) => femaleNames.test(voice.name)) ?? pool[0] ?? null;
  }
  return pool.find((voice) => voice.default) ?? pool[0] ?? null;
}

export class NarrationEngine {
  private unlocked = false;
  private pendingTimer: ReturnType<typeof setTimeout> | null = null;
  private playToken = 0;

  constructor(private readonly onVoiceDucking: VoiceDuckingCallback) {}

  unlock(): boolean {
    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) return false;
    try {
      if (this.unlocked) {
        window.speechSynthesis.resume();
        return true;
      }
      this.unlocked = true;
      // iOS 需要先在真實觸碰內送入一個無聲 utterance，後續 WebSocket 事件才能繼續朗讀。
      const primer = new SpeechSynthesisUtterance('　');
      primer.lang = 'zh-TW';
      primer.volume = 0;
      window.speechSynthesis.speak(primer);
      return true;
    } catch {
      this.unlocked = false;
      return false;
    }
  }

  play(screen: StoryScreenId): void {
    this.stop();
    const cue = NARRATION_CUES[screen];
    if (!cue || !this.unlocked) return;
    const token = ++this.playToken;
    this.pendingTimer = setTimeout(() => {
      this.pendingTimer = null;
      if (token !== this.playToken) return;
      const utterance = new SpeechSynthesisUtterance(cue.text);
      const settings = voiceSettings(cue.role);
      utterance.lang = 'zh-TW';
      utterance.rate = settings.rate;
      utterance.pitch = settings.pitch;
      utterance.volume = settings.volume;
      utterance.voice = preferredVoice(window.speechSynthesis.getVoices(), cue.role);
      utterance.onstart = () => this.onVoiceDucking(true);
      const release = () => this.onVoiceDucking(false);
      utterance.onend = release;
      utterance.onerror = release;
      try {
        window.speechSynthesis.speak(utterance);
      } catch {
        release();
      }
    }, cue.delayMs ?? 0);
  }

  stop(): void {
    this.playToken += 1;
    if (this.pendingTimer !== null) clearTimeout(this.pendingTimer);
    this.pendingTimer = null;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    this.onVoiceDucking(false);
  }
}
