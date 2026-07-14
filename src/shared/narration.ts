import type { StoryScreenId } from './story';

export type NarrationRole = 'manager' | 'xiaoyu' | 'mother' | 'whisper' | 'entity';

export interface NarrationCue {
  speaker: string;
  role: NarrationRole;
  text: string;
  delayMs?: number;
}

/**
 * 手機端實際朗讀的角色台詞，同時也是大螢幕字幕來源。
 * 不逐字朗讀操作說明；語音只負責讓玩家相信房裡真的有人正對他說話。
 */
export const NARRATION_CUES: Partial<Record<StoryScreenId, NarrationCue>> = {
  prologue: {
    speaker: '管理室錄音',
    role: 'manager',
    text: '凌晨三點十七分。407 號房，最後點交。確認窗戶、照片和門鎖。不要回答房內電話。',
    delayMs: 450,
  },
  'call-window': {
    speaker: '小雨・房內線',
    role: 'xiaoyu',
    text: '你終於來了。雨一直灌進來。左邊的窗戶沒有關好。可以幫我，把窗扣壓下去嗎？',
    delayMs: 260,
  },
  'find-window': {
    speaker: '小雨・房內線',
    role: 'xiaoyu',
    text: '左邊。再過去一點。窗外……好像有人。',
    delayMs: 350,
  },
  'window-opened': {
    speaker: '小雨・房內線',
    role: 'entity',
    text: '紅線斷了。她現在……看得到你了。',
    delayMs: 700,
  },
  'find-portrait': {
    speaker: '小雨・房內線',
    role: 'xiaoyu',
    text: '照片歪了。幫我們擺正，好嗎？',
    delayMs: 420,
  },
  'portrait-inspect-front': {
    speaker: '你身後',
    role: 'whisper',
    text: '玻璃裡……多了一道呼吸。',
    delayMs: 600,
  },
  'portrait-inspect-back': {
    speaker: '林太太・錄音殘響',
    role: 'mother',
    text: '不要放下。那個聲音，不是照片傳來的。它在你背後。',
    delayMs: 420,
  },
  'portrait-changed': {
    speaker: '管理室錄音',
    role: 'manager',
    text: '照片裡的人換了。死亡時間，就是抽屜的密碼。',
    delayMs: 380,
  },
  'find-drawer': {
    speaker: '你身後',
    role: 'whisper',
    text: '左下方的矮櫃。裡面有東西……正在轉動。',
    delayMs: 500,
  },
  'keypad-0317': {
    speaker: '林太太・錄音殘響',
    role: 'mother',
    text: '死亡時間，三點十七分。零。三。一。七。',
    delayMs: 300,
  },
  'tape-warning-one': {
    speaker: '錄音帶・林太太',
    role: 'mother',
    text: '如果你聽見小雨叫媽媽，不要回答。我的女兒，三天前已經死了。回來的東西，只是在學她。',
    delayMs: 350,
  },
  'tape-warning-two': {
    speaker: '錄音帶・嚴重毀損',
    role: 'mother',
    text: '窗扣的紅線，照片後的記號，還有門鎖。三道封印，一道都不能拆。門外哭的不是她。你背後的……才是。',
    delayMs: 350,
  },
  'find-door': {
    speaker: '錄音帶・林太太',
    role: 'mother',
    text: '不要靠近那扇門。先聽。哭聲如果在門外，腳步就不該在房裡。',
    delayMs: 400,
  },
  'door-listen': {
    speaker: '小雨・門外',
    role: 'entity',
    text: '媽媽。我知道妳在裡面。我聽見妳呼吸了。快開門。',
    delayMs: 450,
  },
  'door-choice': {
    speaker: '小雨・門外',
    role: 'entity',
    text: '媽媽在門外。快開門。不要聽錄音帶。她在騙你。',
    delayMs: 280,
  },
  'reseal-portrait': {
    speaker: '錄音帶・林太太',
    role: 'mother',
    text: '先封住照片。不要看第四個人的臉。',
    delayMs: 240,
  },
  'reseal-window': {
    speaker: '錄音帶・林太太',
    role: 'mother',
    text: '把紅線纏回窗扣。腳步已經進來了。不要轉身。',
    delayMs: 240,
  },
  'reseal-door': {
    speaker: '錄音帶・林太太',
    role: 'mother',
    text: '最後是門鎖。鎖上之後，不管聽到什麼，都不要回答。',
    delayMs: 240,
  },
  'ending-open': {
    speaker: '小雨・你的房間',
    role: 'entity',
    text: '謝謝你。現在，我知道你住在哪裡了。',
    delayMs: 520,
  },
  'ending-sealed': {
    speaker: '林太太・最後錄音',
    role: 'mother',
    text: '不要接。這一次，電話是從你自己的號碼打來的。',
    delayMs: 450,
  },
};

export interface NarrationVoiceSettings {
  rate: number;
  pitch: number;
  volume: number;
}

export function voiceSettings(role: NarrationRole): NarrationVoiceSettings {
  switch (role) {
    case 'manager':
      return { rate: 0.82, pitch: 0.76, volume: 0.96 };
    case 'xiaoyu':
      return { rate: 0.8, pitch: 1.36, volume: 0.94 };
    case 'mother':
      return { rate: 0.76, pitch: 0.58, volume: 0.92 };
    case 'whisper':
      return { rate: 0.7, pitch: 0.48, volume: 0.72 };
    case 'entity':
      return { rate: 0.76, pitch: 1.52, volume: 1 };
  }
}
