export type StoryScreenId =
  | 'standby'
  | 'prologue'
  | 'incoming-407'
  | 'call-window'
  | 'find-window'
  | 'window-opened'
  | 'find-portrait'
  | 'portrait-changed'
  | 'find-drawer'
  | 'keypad-0317'
  | 'tape-warning-one'
  | 'tape-warning-two'
  | 'find-door'
  | 'door-choice'
  | 'reseal-portrait'
  | 'reseal-window'
  | 'reseal-door'
  | 'ending-open'
  | 'ending-sealed';

export type StoryScreenKind =
  | 'idle'
  | 'message'
  | 'incoming'
  | 'call'
  | 'objective'
  | 'keypad'
  | 'choice'
  | 'ending';

export interface StoryScreen {
  kind: StoryScreenKind;
  eyebrow: string;
  title: string;
  body: string;
  objective?: string;
  actionLabel?: string;
  primaryLabel?: string;
}

export const STORY_SCREENS: Record<StoryScreenId, StoryScreen> = {
  standby: {
    kind: 'idle',
    eyebrow: '407 號房',
    title: '等待點交',
    body: '戴上耳機，手機就是你的手電筒與唯一聯絡方式。',
    actionLabel: '開始／動作',
  },
  prologue: {
    kind: 'message',
    eyebrow: '管理室・03:17',
    title: '最後點交',
    body: '407 號房明早拆除。確認窗戶、牆上照片與門鎖後立刻離開。不要回覆房內電話。',
    objective: '等待管理室傳送點交項目',
  },
  'incoming-407': {
    kind: 'incoming',
    eyebrow: '來電',
    title: '407 房內線',
    body: '這支電話十九年前就已經停用了。按下手機中央鍵接聽。',
    primaryLabel: '接聽',
  },
  'call-window': {
    kind: 'call',
    eyebrow: '407 房內線・小雨',
    title: '「你終於來了。」',
    body: '雨一直灌進來……左邊的窗戶沒有關好。可以幫我把窗扣壓下去嗎？按下中央鍵掛斷。',
    primaryLabel: '掛斷並查看',
  },
  'find-window': {
    kind: 'objective',
    eyebrow: '點交項目 1／3',
    title: '關閉左側窗戶',
    body: '看著大螢幕，移動手機尋找窗扣。對準後按手機中央鍵。',
    objective: '尋找左側滲水的窗戶',
    actionLabel: '壓下窗扣',
  },
  'window-opened': {
    kind: 'message',
    eyebrow: '封條 1／3',
    title: '窗扣裡纏著紅線',
    body: '紅線斷了。剛才那張臉在玻璃裡面。按下中央鍵繼續點交。',
    primaryLabel: '繼續',
  },
  'find-portrait': {
    kind: 'objective',
    eyebrow: '點交項目 2／3',
    title: '擺正牆上照片',
    body: '照片後方傳來規律的刮擦聲。對準照片後按手機中央鍵。',
    objective: '尋找牆中央的家庭照',
    actionLabel: '擺正照片',
  },
  'portrait-changed': {
    kind: 'message',
    eyebrow: '照片背面',
    title: '03：17',
    body: '照片裡原本有三個人。現在第四個人站在他們後面。照片背面寫著：抽屜密碼是死亡時間。按中央鍵查看抽屜。',
    primaryLabel: '查看抽屜',
  },
  'find-drawer': {
    kind: 'objective',
    eyebrow: '點交記錄',
    title: '打開左側矮櫃',
    body: '對準矮櫃抽屜後按手機中央鍵，密碼鎖會出現在大螢幕。',
    objective: '在左側矮櫃尋找錄音帶',
    actionLabel: '檢查抽屜',
  },
  'keypad-0317': {
    kind: 'keypad',
    eyebrow: '四位數密碼鎖',
    title: '03：17',
    body: '不用低頭。看著大螢幕，每按一次手機中央鍵，轉入下一位死亡時間。',
  },
  'tape-warning-one': {
    kind: 'call',
    eyebrow: '錄音帶・林太太',
    title: '「聽到小雨的聲音，不要回答。」',
    body: '我的女兒在三天前就死了。回來的那個東西會學她說話，我把它鎖在房裡。按中央鍵繼續播放。',
    primaryLabel: '繼續播放',
  },
  'tape-warning-two': {
    kind: 'call',
    eyebrow: '錄音帶・嚴重毀損',
    title: '「三道封印不能拆。」',
    body: '窗扣的紅線、照片後面的記號，還有門鎖。只要第三道被打開，它就能跟著你離開。按中央鍵停止錄音。',
    primaryLabel: '停止播放',
  },
  'find-door': {
    kind: 'objective',
    eyebrow: '走廊傳來敲門聲',
    title: '不要相信門外的聲音',
    body: '房門開始震動。對準右側門鎖後按手機中央鍵。',
    objective: '檢查右側房門',
    actionLabel: '握住鑰匙',
  },
  'door-choice': {
    kind: 'choice',
    eyebrow: '407 房內線・小雨',
    title: '「媽媽在門外，快開門。」',
    body: '門外的小女孩正在哭。但濕腳印正從你身後走向門口。用光照向左或右的選擇，再按中央鍵。',
  },
  'reseal-portrait': {
    kind: 'objective',
    eyebrow: '重新封印 1／3',
    title: '先把照片壓回牆面',
    body: '不要看照片裡第四個人的臉。對準照片後按手機中央鍵。',
    objective: '回到牆中央的照片',
    actionLabel: '封住照片',
  },
  'reseal-window': {
    kind: 'objective',
    eyebrow: '重新封印 2／3',
    title: '重新扣上窗戶',
    body: '腳步已經進入房間。對準左側窗扣後按手機中央鍵。',
    objective: '回到左側窗戶',
    actionLabel: '纏回紅線',
  },
  'reseal-door': {
    kind: 'objective',
    eyebrow: '重新封印 3／3',
    title: '鎖住房門',
    body: '不要轉身。對準右側門鎖後按手機中央鍵。',
    objective: '完成最後一道封印',
    actionLabel: '反鎖房門',
  },
  'ending-open': {
    kind: 'ending',
    eyebrow: '壞結局',
    title: '點交完成',
    body: '407 號房已解除封鎖。新的封鎖位置：你的房間。按中央鍵再玩一次。',
    primaryLabel: '再玩一次',
  },
  'ending-sealed': {
    kind: 'ending',
    eyebrow: '封印結局',
    title: '407 仍然上鎖',
    body: '管理室查無此次點交記錄。幾秒後，你的手機收到一通來自自己號碼的電話。按中央鍵再玩一次。',
    primaryLabel: '再玩一次',
  },
};

export type StoryActionId =
  | 'answer'
  | 'continue'
  | 'digit'
  | 'clear-code'
  | 'submit-code'
  | 'choose-open'
  | 'choose-seal';
