# ThreatTrack promo — audio credits

## Voiceover
- Narration: user-supplied ElevenLabs recording (voice "Nathan – Virtual Radio Host"), `audio/vo-user/nathan.mp3`.
  Word timings via ElevenLabs Speech-to-Text (`tools/transcribe-vo.mjs`), corrected against the audio envelope and cut per
  scene by `tools/import-vo.mjs`. On the ElevenLabs free plan, attribution is required and commercial use is not licensed.
- Fallbacks: `tools/generate-vo-eleven.mjs` (ElevenLabs TTS take) and `tools/generate-vo.mjs` (edge-tts, offline).

## Music
- "Called to Win" — CC0 (public domain), from the Internet Archive item
  "Public Domain Background Tracks": https://archive.org/details/public-domain-background-tracks
  (file: called-to-win.mp3). Starts 1.5 s in, ducked under the narration, 2.2 s fade-out.
  Downloaded to `audio/music/` (git-ignored); see `tools/mix.mjs`.

## Sound effects
- All SFX are synthesized in code (Web Audio oscillators and filtered noise) by `assets/audio-engine.js`,
  rendered offline by `tools/render-sfx.mjs`. No third-party recordings are used.
