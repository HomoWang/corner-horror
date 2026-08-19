# Room 307 Architecture

The project is split into stable platform layers and replaceable game content. Story, rooms, puzzles,
and art must not own networking or desktop lifecycle code.

## Runtime layers

1. **Windows host (`desktop/`)**
   - Packages the Vite host into an Electron executable.
   - Owns the game window, fullscreen behavior, audio autoplay policy, and persistent save file.
   - Does not contain story or puzzle logic.

2. **Game host (`src/host/`, `src/prototype/host.ts`)**
   - Renders the room and runs authoritative game state.
   - Sends inventory and haptic state to the phone.
   - The phone never decides whether a puzzle succeeds.

3. **Phone controller (`src/controller/`, `src/prototype/controller.ts`)**
   - Reads motion sensors, joystick, interaction, and inventory input.
   - Displays only controller UI and mirrored inventory state.
   - Is hosted on HTTPS so iPhone motion permission works reliably.

4. **Relay (`server/`)**
   - Pairs one host and one controller by random room code.
   - Forwards validated protocol messages and owns no game state.
   - Normal disconnects reconnect automatically; replaced clients stay disconnected.

5. **Shared contracts (`src/shared/`)**
   - Defines network messages, calibration math, story contracts, and persistence format.
   - Changes here require tests because both screens depend on them.

## Persistence

The Windows build stores `save-v1.json` in Electron's per-user data directory through a restricted
preload bridge. Browser development uses `localStorage` through the same `persistence.ts` API.
Save data is versioned so future story changes can migrate old saves.

## Deployment boundaries

- The Windows host is built with `pnpm run desktop:package`.
- The phone controller is deployed separately to a stable HTTPS URL.
- The WebSocket relay is deployed separately and must not use a sleeping free service for release.
- Steam receives the packaged Windows folder only. Steamworks features remain optional adapters.

## Asset pipeline

- `public/` is runtime-only. Blender files, unused model variants, source textures, and reference
  images belong in the workspace `素材` folder and must not be copied into a release.
- Each chapter will own an asset manifest. The chapter loader may preload the next small group, but
  it must not load every floor at startup.
- Prefer compressed GLB meshes and GPU-compressed textures for release. Keep original high-resolution
  textures outside `public/`.
- Measure Windows package size, first-scene load time, and peak memory before adding the next chapter.
- Current prototype baseline: roughly 731 MB packaged, including roughly 383 MB of runtime assets.
  This is a measurement baseline, not the final size target.

## Content rule

New chapters may add scenes, objects, puzzles, audio, and item definitions. They must use the shared
input, persistence, audio, and connection services instead of creating chapter-specific sockets or
desktop APIs.
