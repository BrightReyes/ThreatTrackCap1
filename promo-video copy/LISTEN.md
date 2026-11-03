# LISTEN.md — watch & ear check for renders/threattrack-promo.mp4 (v5, 1:20.6)

v5 = **your own ElevenLabs recording (Nathan)**, used exactly as recorded — cut per scene in the natural pauses (never
mid-word), placed on each scene cut, with picture beats synced to the spoken words. Plus the camera system and 3-shard logo reveal.
`node tools/audio-qa.mjs` measures the mix (no overlap, no early/late speech, no dead air, −14 LUFS / −1 dBTP);
`node tools/qa-audit.mjs` checks layout and that the camera settles before each reading frame. A human decides how it *feels*:

| Timecode | What should happen | Check |
|---|---|---|
| **0:00 – 0:08** | "What if getting help was only one tap away?" → "…no time to waste." | Voice starts right on the picture; zoom-through into the architecture. |
| **0:13.7** | "Report, track, respond." | Each word punches in as it's spoken. |
| **0:17.7** | "Hold SOS for three seconds" | The hold starts on "Hold"; camera pushes into the button. |
| **0:42.5 / 0:46.4** | "Headquarters assigns…" / "…you stay informed" | Camera tracks the dispatch columns in step with the narration. |
| **0:59.0** | "Always human." | AI plan approved on "Always". |
| **1:00.3 – 1:09** | Community storm (7 phrases) | Each on-screen phrase appears with its spoken phrase. |
| **1:14.1 → 1:17.9** | Logo reveal | Heartbeat build → flash → shards on "Report," "track," "respond," → lock on "ThreatTrack". |

If something feels off:
- **New recording** → replace `audio/vo-user/nathan.mp3` (or point `voiceProfile.file` at a new file), update the per-scene
  text in `audio/vo-script.json` to match it word-for-word, then `node tools/build.mjs --vo` (re-transcribes, re-cuts, re-syncs).
- **A beat should land on a different word** → the `sync` rules in `tools/retime.mjs` (by word text).
- **Camera too much / too little** → the CAMERA block near the end of `assets/anim.js` (one line per move, per scene).
- **Music under the voice** → `MUSIC_GAIN_DB` / `sidechaincompress` in `tools/mix.mjs`. **SFX** → `audio/cues.src.json`.

## Rebuild
```bash
node tools/build.mjs            # retime → cues → SFX → mix → render → mux → audio QA
node tools/build.mjs --vo       # re-transcribe your recording first (needs ELEVENLABS_API_KEY in .env)
node tools/qa-audit.mjs         # layout/contrast/camera QA (needs a preview server on :3002)
```

## How timing works
`anim.js`, `audio/cues.src.json` and `tools/qa-audit.mjs` are authored in **source** seconds. `tools/retime.mjs`
sizes each scene to its spoken line and adds **word-level sync knots** (word times from Speech-to-Text, corrected
against the actual audio onsets, in `audio/vo/words.json`) so key beats land on the word that names them. It writes `TL.warp` into `timeline.js`;
picture, camera, SFX and captions all read that warp, so they can't drift from the voice.
