# THE CORNER

A two-screen cinematic browser horror experience. Open the host on a larger screen, scan its QR
code with a phone, then keep watching the host while using the phone only as a motion-controlled
flashlight and one-button controller.

The first playable chapter is **407 號房：最後點交**: a 6–10 minute investigation with a phone
call, window and portrait triggers, a host-screen code sequence, a recorded warning, an aimed door
choice, and two endings. The complete event outline is documented in [STORY.md](STORY.md).

After the phone is ready, press its central button to start. The phone owns the guaranteed audio
track because that touch can unlock mobile audio directly. The host can optionally be clicked once
for synchronized room audio, but it never blocks the experience. Story text, codes, and choices
stay on the larger screen. Character dialogue uses the phone's on-device Traditional Chinese speech
voice and appears as synchronized subtitles on the host; no generated voice recording is redistributed.
Mobile Safari or Chrome is recommended for speech synthesis and orientation support.

## Live experience

https://homowang.github.io/corner-horror/

The relay uses a free Render service. After a long idle period, the first connection can take
around one minute to wake up; leave the host page open and it will reconnect automatically.

## Development

```bash
npm install
npm run dev
```

Vite serves the host, controller, LAN QR endpoint, and local WebSocket relay together over HTTPS.

## 即時出擊原型

主畫面網址加上 `?mode=raid`，或從等待掃碼畫面選擇「進入即時出擊模式」。手機掃描該模式的
QR Code 後會變成體感光槍：移動手機即時瞄準、按住射擊，發光核心造成雙倍傷害。原型包含
三波敵人、連擊計分、玩家生命、敵人即時反擊，以及具有三階段攻勢的 Boss；預設的 407
號房故事模式不受影響。

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run build:server
```

Deployment details are documented in [DEPLOYMENT.md](DEPLOYMENT.md). Audio sources and licensing
are recorded in [public/assets/audio/SOURCES.md](public/assets/audio/SOURCES.md); original visual
asset generation notes are recorded in [public/assets/SOURCES.md](public/assets/SOURCES.md). The
horror pacing references and the elements adapted for this project are recorded in
[HORROR_DESIGN_RESEARCH.md](HORROR_DESIGN_RESEARCH.md).
