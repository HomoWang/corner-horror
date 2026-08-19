# Audio asset sources

Source record updated on 2026-08-01. These audio files were downloaded from Mixkit and are used under the
[Mixkit Free License](https://mixkit.co/license/). Mixkit states that its free sound effects and
music may be used in personal and commercial projects; attribution is not required.

| Local file | Mixkit item / source | Purpose |
| --- | --- | --- |
| `horror-score-piano-horror.mp3` | [Piano Horror — Francisco Alvear](https://mixkit.co/free-stock-music/tag/horror/) | Looping background score |
| `horror-ambience.mp3` | [Horror ambience](https://mixkit.co/free-sound-effects/horror/) | Looping room atmosphere |
| `cinematic-deep-impact.mp3` | [Cinematic whoosh deep impact](https://mixkit.co/free-sound-effects/horror/) | Jump-scare low-frequency hit |
| `scary-door-opening.mp3` | [Scary wooden door opening](https://mixkit.co/free-sound-effects/doors/) | Pre-scare directional cue |
| `vintage-telephone-ring.mp3` | [Vintage telephone ringtone](https://mixkit.co/free-sound-effects/phone/) | Phone-call event |
| `jumpscare-scream.mp3` | [Trailer screaming people annihilation](https://mixkit.co/free-sound-effects/scream/) | Jump-scare scream |
| `ui-error-buzzer.mp3` | [Wrong answer bass buzzer](https://mixkit.co/free-sound-effects/error/) | Incorrect puzzle feedback |
| `keypad-key.mp3` | [ATM cash machine key press](https://mixkit.co/free-sound-effects/key/) | Keypad input feedback |
| `heavy-footsteps-loop.mp3` | [Footsteps in a tunnel loop](https://mixkit.co/free-sound-effects/footsteps/) | Source recording segmented into individual player footsteps |
| `password-keypad.mp3` | User-provided project audio (`密碼音效.mp3`, 2026-08-04) | Active password-lock input feedback |
| `password-unlock.mp3` | User-provided project audio (`密碼解鎖.mp3`, 2026-08-04) | Correct password and drawer unlock feedback |
| `password-error.mp3` | User-provided project audio (`密碼錯誤.mp3`, 2026-08-04) | Incorrect password confirmation feedback |
| `password-reset.mp3` | User-provided project audio (`密碼刪除&重新.mp3`, 2026-08-04) | Password delete and reset feedback |
| `pencil-rubbing.mp3` | User-provided project audio (`鉛筆畫畫.mp3`, 2026-08-04) | Receipt rubbing while interaction is held and the cursor moves |
| `player-walking.mp3` | User-provided project audio (`走路音效.mp3`, 2026-08-04) | Active looping player walking sound |

The scream is a 2.4-second project cut of the downloaded source. The ambience, door, and ring
files are short usable excerpts to keep mobile loading time low.

## Character narration

Character dialogue is not a bundled audio asset. It is authored in `src/shared/narration.ts` and
spoken at runtime by the player's own device through the Web Speech API after the user presses the
controller start button. This avoids redistributing output from a proprietary desktop TTS voice or
a Chinese open-source model whose training-data license is unclear. The host displays the same authored
line as a synchronized subtitle when speech synthesis is unavailable.
