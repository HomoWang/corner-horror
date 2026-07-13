# Jump-scare and audio upgrade — 2026-07-14

## Reported problem

- The previous figure event was too dark and easy to miss.
- The procedural tones sounded synthetic rather than cinematic.
- The phone did not deliver a convincing ringtone, scream, or horror atmosphere.

## Changes

- Replaced the timed figure reveal with an empty-corner look trigger.
- At 9 seconds the corner remains visually empty and a door sound raises tension.
- Looking toward the corner for 90 ms triggers a full-screen face, punch zoom, flicker, shake,
  red flash, real scream, deep impact, and a strong phone vibration pattern.
- Added a dedicated `jumpscare` WebSocket cue so the phone plays the scream directly after its
  user-gesture audio unlock.
- Added looping Mixkit horror score and room ambience on both host and controller.
- Replaced the phone's synthesized bell with a vintage telephone recording.
- Kept procedural audio as an offline/decoding fallback.
- Added reusable decoded Web Audio sample loading in `src/shared/audio-assets.ts`.

## Visual asset

- Local file: `public/assets/jumpscare-face.png`
- Generator: Codex built-in image generation
- Mode: text-to-image
- Prompt: "Create an original cinematic supernatural jump-scare image for a browser horror game,
  16:9 landscape. A terrifying pale ghostly adult woman abruptly lunges extremely close toward
  the camera from pitch blackness, face filling roughly 80% of the frame, mouth open in a violent
  scream, unnaturally dark eye sockets with tiny catchlights, stringy black hair whipping forward,
  realistic skin texture, cold sickly flashlight from below, subtle deep-red rim light, aggressive
  motion blur at the hair and shoulders but razor-sharp eyes and teeth. Black background with no
  room details so the face appears from nowhere. Photorealistic modern horror-film still, high
  contrast, unsettling, genuinely frightening. No gore, no blood, no text, no border, no logo,
  no watermark, one face only, no extra limbs."

## Verification

- TypeScript typecheck: PASS
- Vitest: PASS — 6 files, 29 tests
- Vite production build: PASS
- Distribution asset check: PASS — face image and all six audio files present in `dist/assets`
