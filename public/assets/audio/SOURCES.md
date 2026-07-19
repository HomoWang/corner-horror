# Audio asset sources

Recorded on 2026-07-14. These audio files were downloaded from Mixkit and are used under the
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

The scream is a 2.4-second project cut of the downloaded source. The ambience, door, and ring
files are short usable excerpts to keep mobile loading time low.

## Character narration

Character dialogue is not a bundled audio asset. It is authored in `src/shared/narration.ts` and
spoken at runtime by the player's own device through the Web Speech API after the user presses the
controller start button. This avoids redistributing output from a proprietary desktop TTS voice or
a Chinese open-source model whose training-data license is unclear. The host displays the same authored
line as a synchronized subtitle when speech synthesis is unavailable.

## Raid mode

Raid mode does not download or play the files listed above and never plays audio on the phone.
Its computer-side ambience, warning siren, weapon report, hit confirmation, explosions, creature
roars, damage alarm, interface cues, and victory sting are synthesized at runtime with the Web Audio
API in `src/host/audio.ts`. The phone remains an orientation, trigger, and haptics controller only.
