# LISTEN.md — ear check for out/final.mp4

Claude cannot hear the mix. The scripts measured it; a human decides. Five timecodes to check with headphones:

| Timecode | What should happen | What to listen for |
|---|---|---|
| **0:05.13** | Logo arrives (Z pull), first hero | A short dead stop in the music, a reverse build, then one soft carpet thump on the landing frame. No double hit. |
| **0:12.74** | SOS button released after the 3 s hold | A long rise through the hold, the thump lands as the button springs back. The music dip should feel like a held breath, not a glitch. |
| **0:29.70** | Command center window lands | Second-largest hit of the film. QA says its 250–500 Hz body is 2.4 dB over the music (wants 3): check it does not vanish under the bass line. Stat ticks follow at 0:30.6 to 0:31.5. |
| **0:39.84** | Officer clicks "Dispatch Precinct" | Thump on the click, then a soft glass chime at 0:40.3 when "Responder update sent" appears, then a whoosh as the phone slides in from the right. |
| **1:00.23** | Outro logo | Final hero. QA says its body only clears the music by 0.7 dB: this is the one most likely to feel weak. The music fades over the last 1.2 s; nothing should click or cut off at 1:03. |

QA result after two rounds (`audio/qa-round2.txt`): loudness −14.0 LUFS, true peak −1.8 dBTP, sync 0 frames off on every cue, no unplanned music dips, no silence. 20 FAILs remain: 14 small UI sounds measured 0.6 to 1.5 dB over the music (threshold 1.5 dB), the two hero-body notes above, and 4 picture-motion checks on the hero frames where the detector finds no motion right before the landing. Thresholds were not loosened.

Also worth a pass: the typing keys at 0:19.3 to 0:20.6 and the AI "stream" keys at 0:46.8 to 0:49.3 are the densest cue groups. If they feel busy, lower them in `tools/cues.mjs` (reduce the loop count) and rebuild.

Rebuild after any change:

```bash
node tools/cues.mjs
uv run <sound-layer>/scripts/mix.py audio/cues.json
ffmpeg -y -i renders/promo-silent.mp4 -i audio/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -movflags +faststart -shortest out/final.mp4
uv run <sound-layer>/scripts/qa.py out/final.mp4
```
