export const GAME_CANON = {
  title: '307',
  firstChapter: '開端',
  protagonist: {
    occupation: '消防員',
    childhoodTrauma: '小時候在火災中失去至親，因此立志成為消防員。',
  },
  reality: {
    girlfriendSurvived: true,
    protagonistIsDead: false,
    state: '主角成功救出女友後身受重傷，正在醫院昏迷。',
    nightmare: '遊戲流程是主角在昏迷中反覆經歷的錯誤記憶。',
  },
  endings: {
    openDoor: '主角在醫院醒來，守在病床旁的女友喜極而泣。',
    closeDoor: '畫面全黑，心電監護儀停止跳動並留下持續長音。',
  },
} as const;
