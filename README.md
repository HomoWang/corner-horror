# 307

A single-player horror puzzle game displayed on a Windows PC and controlled by a phone. The PC owns
the room, story, audio, puzzle state, and saves; the phone supplies motion aiming, movement,
interaction, inventory selection, and haptic feedback.

The story follows a firefighter trapped in a distorted memory of the night he entered room 307 to
rescue his girlfriend. He believes she died, but the complete memory reveals that she survived and
he is the one lying critically injured. The target play time for the complete prototype is 20–30
minutes. [STORY.md](STORY.md) is the only canonical plot source; the detailed opening chapter is
documented in [CHAPTER_1_OPENING.md](CHAPTER_1_OPENING.md).

The computer always plays game audio. The phone remains portrait-only and shows six persistent
inventory slots above the central movement and interaction control. Mobile Safari is recommended on
iPhone because motion permission requires a secure page and an explicit start gesture.

## Live experience

https://homowang.github.io/corner-horror/

The relay uses a free Render service. After a long idle period, the first connection can take
around one minute to wake up; leave the host page open and it will reconnect automatically.

## Development

```bash
pnpm install
pnpm dev
```

## Windows desktop development

The desktop mode opens the host in a standalone Electron game window while the phone continues to
use the hosted HTTPS controller shown by the QR code.

```bash
pnpm desktop:dev
```

Create a self-contained Windows test build:

```bash
pnpm desktop:package
```

The executable is written to `release/Room307-win32-x64/Room307.exe`. Press `F11` to toggle
fullscreen and `Esc` to leave fullscreen.

Vite serves the host, controller, LAN QR endpoint, and local WebSocket relay together over HTTPS.

## Verification

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm build:server
```

Deployment details are documented in [DEPLOYMENT.md](DEPLOYMENT.md). Audio sources and licensing
are recorded in [public/assets/audio/SOURCES.md](public/assets/audio/SOURCES.md); original visual
asset generation notes are recorded in [public/assets/SOURCES.md](public/assets/SOURCES.md).
