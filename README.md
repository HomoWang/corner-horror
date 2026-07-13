# THE CORNER

A two-screen cinematic browser horror experience. Open the host on a larger screen, scan its QR
code with a phone, then keep watching the host while using the phone only as a motion-controlled
flashlight and one-button controller.

The first playable chapter is **407 號房：最後點交**: a 6–10 minute investigation with a phone
call, window and portrait triggers, a host-screen code sequence, a recorded warning, an aimed door
choice, and two endings. The complete event outline is documented in [STORY.md](STORY.md).

After the phone is ready, click **開啟聲音並開始** once on the host. Browsers require this host-side
gesture to unlock room audio. From that point onward, every interaction uses the phone's same
central button; story text, codes, and choices stay on the larger screen.

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

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run build:server
```

Deployment details are documented in [DEPLOYMENT.md](DEPLOYMENT.md). Audio sources and licensing
are recorded in [public/assets/audio/SOURCES.md](public/assets/audio/SOURCES.md); original visual
asset generation notes are recorded in [public/assets/SOURCES.md](public/assets/SOURCES.md).
