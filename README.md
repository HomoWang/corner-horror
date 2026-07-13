# THE CORNER

A phone-controlled cinematic browser horror experience. Open the host on a larger screen, scan
its QR code with a phone, allow motion sensors and audio, then use the phone as the flashlight.

The first playable chapter is **407 號房：最後點交**: a 6–10 minute investigation with a phone
call, window and portrait triggers, a keypad puzzle, a recorded warning, a door choice, and two
endings. The complete event outline is documented in [STORY.md](STORY.md).

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
