# LISTEN.md — ear check for out/final.mp4 (v5 cut, Apple-style kinetic type on black)

Claude cannot hear the mix. The scripts measured it; a human decides. Five timecodes to check with headphones:

| Timecode | What should happen | What to listen for |
|---|---|---|
| **0:01.6** | Radar finds the mark, logo pops | Music dead-stops for a beat, reverse build, one thump with a low boom under it. No double hit. |
| **0:17.35** | SOS released after the 3 s hold | A long rise through the hold; the thump lands as the button springs back and the rows slam in. |
| **0:29.4** | Command center card lands | Second-largest hit. Should sit under the music, not over it. Stat ticks follow at 0:29.5 to 0:30.1. |
| **0:36.07** | Dispatcher clicks "Dispatch Precinct" | Thump on the click, then a soft glass chime at 0:36.6 when the citizen side flips to "Help is on the way". |
| **0:56.95** | Outro logo on the flatline | Final hero. The music fades over the last 1.4 s; nothing should click or cut off at 1:02. |

Every hard cut (0:03.2, 0:05.4, 0:08.0, 0:11.4, 0:13.6, 0:19.9, 0:24.5, 0:28.6, 0:32.9, 0:42.6, 0:47.6, 0:51.2, 0:55.4) carries one air whoosh, and every snapped headline a short cloth swish. If the swishes feel busy, thin the `word()` calls in `tools/cues.mjs`.

See `audio/qa-v2.txt` for the measured result. Thresholds were not loosened.

Rebuild after any change:

```bash
node tools/cues.mjs
uv run <sound-layer>/scripts/mix.py audio/cues.json
npx hyperframes render . --output renders/promo-silent.mp4 --quality high
ffmpeg -y -i renders/promo-silent.mp4 -i audio/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -movflags +faststart -shortest out/final.mp4
uv run <sound-layer>/scripts/qa.py out/final.mp4
```
