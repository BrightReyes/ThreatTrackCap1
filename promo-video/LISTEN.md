# LISTEN.md — ear check for out/final.mp4 (v2 cut)

Claude cannot hear the mix. The scripts measured it; a human decides. Five timecodes to check with headphones:

| Timecode | What should happen | What to listen for |
|---|---|---|
| **0:01.9** | Logo pops on the pulse line | Music dead-stops for a beat, a reverse build, one soft thump on the pop. No double hit. |
| **0:14.75** | SOS released after the 3 s hold | A long rise through the hold; the thump lands as the button springs back. |
| **0:29.95** | Command center card lands | Second-largest hit of the film. Should sit under the music, not over it. Stat ticks follow at 0:30.4 to 0:31.0. |
| **0:38.65** | Dispatcher clicks "Dispatch Precinct" | Thump on the click, then a soft glass chime at 0:39.3 when the citizen side flips to "Help is on the way". |
| **0:57.55** | Outro logo | Final hero. The music fades over the last 1.4 s; nothing should click or cut off at 1:02. |

Every block wipe (0:04.6, 0:10.2, 0:17.6, 0:23.4, 0:29.2, 0:35.0, 0:41.2, 0:47.4, 0:53.2, 0:57.0) carries one air whoosh. If they feel repetitive, drop every other one in `tools/cues.mjs`.

See `audio/qa-report.json` / `audio/qa-v2.txt` for the measured result. Thresholds were not loosened.

Rebuild after any change:

```bash
node tools/cues.mjs
uv run <sound-layer>/scripts/mix.py audio/cues.json
npx hyperframes render . --output renders/promo-silent.mp4 --quality high
ffmpeg -y -i renders/promo-silent.mp4 -i audio/mix.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 256k -movflags +faststart -shortest out/final.mp4
uv run <sound-layer>/scripts/qa.py out/final.mp4
```
