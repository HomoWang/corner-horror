# Visual asset sources

Recorded on 2026-07-14.

| Local file | Source | Purpose |
| --- | --- | --- |
| `room-sequence.png` | Original image generated with Codex image generation | Four-frame abandoned-room cinematic backdrop |
| `jumpscare-face.png` | Original image generated with Codex image generation | Full-screen supernatural jump scare |
| `video-pilot/room407-master.png` | Original image generated with Codex image generation | Live-action Room 407 environment reference for the branching-video pilot |
| `video-pilot/woman-identity.png` | Original image generated with Codex image generation | Recurring antagonist identity and wardrobe reference |
| `video-pilot/woman-reveal.png` | Original image generated with Codex image generation | Restrained doorway-reveal performance reference |
| `video-pilot/woman-jumpscare.png` | Original image generated with Codex image generation | Non-gory final lunge performance reference |
| `video-pilot/p01-incoming-call.mp4` | Original video generated with Google Flow, Veo 3.1 Fast | Silent game-ready opening shot for the branching-video pilot |
| `../../production/video-pilot/source/p01-incoming-call-flow.mp4` | Original video generated with Google Flow, Veo 3.1 Fast | Preserved source download with native generated audio; excluded from the public deployment |
| `video-pilot/p01-last-frame.png` | Frame extracted from the P01 Google Flow output | Exact continuity reference for generating P02 |
| `video-pilot/p02-approach-phone.mp4` | Original video generated with Google Flow, Veo 3.1 Fast | Silent game-ready approach to the telephone for the branching-video pilot |
| `../../production/video-pilot/source/p02-approach-phone-flow.mp4` | Original video generated with Google Flow, Veo 3.1 Fast | Preserved source download with native generated audio; excluded from the public deployment |
| `video-pilot/p02-last-frame.png` | Frame extracted from the P02 Google Flow output | Exact continuity reference for generating P03 |
| `video-pilot/p03-door-threshold.mp4` | Original video generated with Google Flow, Veo 3.1 Fast | Silent game-ready doorway reveal and choice threshold |
| `../../production/video-pilot/source/p03-door-threshold-flow.mp4` | Original video generated with Google Flow, Veo 3.1 Fast | Preserved P03 source download with native generated audio; excluded from the public deployment |
| `video-pilot/p03-last-frame.png` | Frame extracted from the P03 Google Flow output | Exact continuity and antagonist identity reference for both P04 branches |
| `video-pilot/p04a-slam-1.mp4` | Original video generated with Google Flow, Veo 3.1 Fast | Silent first half of the slam-door branch |
| `../../production/video-pilot/source/p04a-slam-1-flow.mp4` | Original video generated with Google Flow, Veo 3.1 Fast | Preserved P04A-1 source download with native generated audio |
| `video-pilot/p04a-slam-1-last-frame.png` | Frame extracted from the P04A-1 Google Flow output | Exact continuity reference for P04A-2 |
| `video-pilot/p04a-slam-2.mp4` | Original video generated with Google Flow, Veo 3.1 Fast; locally edited | Silent second half of the slam-door branch with a 0.2-second opening blackout |
| `../../production/video-pilot/source/p04a-slam-2-flow.mp4` | Original video generated with Google Flow, Veo 3.1 Fast | Preserved unedited P04A-2 source download with native generated audio |
| `video-pilot/p04a-slam-2-last-frame.png` | Frame extracted from the P04A-2 Google Flow source | QA reference for the final jumpscare frame |

Neither image uses a film still, public figure, brand, logo, or third-party fictional character.

## Generation notes

`room-sequence.png` was generated as a fixed-view 2×2 photorealistic horror-room spritesheet:
empty room, altered portrait, doorway silhouette, and post-event room. The prompt prohibited text,
UI, watermarks, dividers, and additional people.

`jumpscare-face.png` was generated as an original cinematic supernatural face lunging from a black
background, with no gore, text, logo, watermark, recognizable person, or copyrighted character.

The four files under `video-pilot/` were generated as an original, internally consistent live-action
horror production pack. The woman is synthetic and is not based on a named or recognizable real
person. The prompts prohibited third-party characters, logos, watermarks, text, and gore.

`p01-incoming-call.mp4` was generated from `video-pilot/room407-master.png` with Google Flow using
Veo 3.1 Fast. The downloaded source is retained unchanged. The game-ready copy removes only the
generated audio stream with a lossless video stream copy; its visuals are otherwise unchanged.

`p02-approach-phone.mp4` was extended from `video-pilot/p01-last-frame.png` with Google Flow using
Veo 3.1 Fast. Its first-frame continuity, room geometry, telephone shape, furniture stability, and
camera move passed visual QA. The game-ready copy likewise removes only the generated audio stream.

`p03-door-threshold.mp4` was extended from `video-pilot/p02-last-frame.png` with Google Flow using
Veo 3.1 Fast. Its first-frame SSIM against the supplied reference is 0.9469. The generated woman
appears as a stable full-face doorway reveal during the final 1.1 seconds; the script was adapted to
use that stronger result as the branch decision frame. The public copy removes the generated audio.

`p04a-slam-1.mp4` was extended from `video-pilot/p03-last-frame.png` with a first-frame SSIM of
0.9261. The generated shot closes the door, adds stable scratch marks, then unexpectedly reopens the
door during its final 1.5 seconds. That coherent deviation was adopted as the setup for P04A-2.

The P04A-2 generation did not preserve the supplied door position (first-frame SSIM 0.4113), but its
telephone turn and final scream performance passed motion QA. The public game copy adds a 0.2-second
black fade at the start to make the discontinuity an intentional supernatural blackout and removes
the native audio. The original Flow download remains unchanged under `production/`.
