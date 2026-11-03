// tools/generate-vo-eleven.mjs — Natural narration via ElevenLabs, recorded as ONE continuous take
// (natural flow across sentences), then split into per-scene stems using character-level timestamps.
//
//   node tools/generate-vo-eleven.mjs --audition          s1 line × a few upbeat voices → audio/vo/audition/*.mp3
//   node tools/generate-vo-eleven.mjs --voices            list available voices (name, id, labels)
//   node tools/generate-vo-eleven.mjs                     full take with voiceProfile.voiceId → audio/vo/s1..s15.mp3
//
// Key: ELEVENLABS_API_KEY from the environment or from promo-video copy/.env (git-ignored). Never printed.
// Writes: audio/vo/full.mp3, audio/vo/alignment.json, audio/vo/<id>.mp3, audio/vo/durations.json, audio/vo/words.json
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./tl.mjs";

const API = "https://api.elevenlabs.io/v1";
const VO_DIR = path.join(ROOT, "audio/vo");
const scriptPath = path.join(ROOT, "audio/vo-script.json");
const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
const profile = script.voiceProfile || {};

function apiKey() {
  if (process.env.ELEVENLABS_API_KEY) return process.env.ELEVENLABS_API_KEY.trim();
  const envFile = path.join(ROOT, ".env");
  if (fs.existsSync(envFile)) {
    const m = fs.readFileSync(envFile, "utf8").match(/^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) return m[1].trim();
  }
  console.error("Missing ELEVENLABS_API_KEY. Put `ELEVENLABS_API_KEY=...` in promo-video copy/.env (git-ignored).");
  process.exit(2);
}
const KEY = apiKey();

async function api(pathname, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${pathname}`, { ...init, headers: { "xi-api-key": KEY, "Content-Type": "application/json", ...(init.headers || {}) } });
    if (res.ok) return res.json();
    const body = (await res.text()).slice(0, 400);
    if ((res.status === 429 || res.status >= 500) && attempt < 4) {
      console.warn(`  ! ${res.status}, retrying...`);
      await new Promise((r) => setTimeout(r, 2000 * attempt));
      continue;
    }
    throw new Error(`ElevenLabs ${res.status} on ${pathname}: ${body}`);
  }
}

const voiceSettings = () => ({
  stability: profile.stability ?? 0.35,
  similarity_boost: profile.similarity ?? 0.8,
  style: profile.style ?? 0.45,
  use_speaker_boost: true,
  speed: profile.speed ?? 1.08
});

async function tts(voiceId, text, outFile) {
  const body = { text, model_id: profile.model || "eleven_multilingual_v2", voice_settings: voiceSettings(), seed: profile.seed ?? 4821 };
  const j = await api(`/text-to-speech/${voiceId}/with-timestamps?output_format=mp3_44100_128`, { method: "POST", body: JSON.stringify(body) });
  fs.writeFileSync(outFile, Buffer.from(j.audio_base64, "base64"));
  return j.alignment;
}

const ffmpeg = (args) => execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", ...args]);
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());

const args = process.argv.slice(2);

if (args.includes("--voices")) {
  const { voices } = await api("/voices");
  for (const v of voices) console.log(`${v.name.padEnd(22)} ${v.voice_id}  ${Object.values(v.labels || {}).join(", ")}`);
  process.exit(0);
}

// ElevenLabs premade voices (stable public IDs) — used when the key can't list voices (no voices_read permission).
const PREMADE = {
  Liam: "TX3LPaxmHKxFdv7VOQHJ", Eric: "cjVigY5qzO86Huf0OWal", Will: "bIHbv24MWmeRgasZH58o",
  Chris: "iP95p4xoKVk53GoZ742B", Brian: "nPczCjzI2devNBz1zQrb", Charlie: "IKne3meq5aSn9XLyUdCD",
  Roger: "CwhRBWXzGAHq8TQ4Fs17", Daniel: "onwK4e9ZLuTAKqWW03F9"
};

if (args.includes("--audition")) {
  const want = (profile.auditionVoices || ["Liam", "Eric", "Will", "Chris", "Brian"]).map((s) => s.toLowerCase());
  let voices;
  try {
    ({ voices } = await api("/voices"));
  } catch (e) {
    if (!/missing_permissions|voices_read/.test(e.message)) throw e;
    console.warn("  (key can't list voices — using ElevenLabs premade voice IDs)");
    voices = Object.entries(PREMADE).map(([name, voice_id]) => ({ name, voice_id }));
  }
  const picks = voices.filter((v) => want.some((w) => v.name.toLowerCase().startsWith(w)));
  const dir = path.join(VO_DIR, "audition");
  fs.mkdirSync(dir, { recursive: true });
  const sample = script.segments.slice(0, 4).map((s) => s.text).join(" ");
  for (const v of picks) {
    const f = path.join(dir, `${v.name.split(/\s|-/)[0].toLowerCase()}.mp3`);
    await tts(v.voice_id, sample, f);
    console.log(`  ✓ ${path.relative(ROOT, f)}   ${v.name} (${v.voice_id})`);
  }
  console.log(`\nListen, then set "voiceId" in audio/vo-script.json → voiceProfile.`);
  process.exit(0);
}

// ---- Full continuous take ----
if (!profile.voiceId) {
  console.error('No voiceProfile.voiceId in audio/vo-script.json. Run with --audition first and pick a voice.');
  process.exit(2);
}
fs.mkdirSync(VO_DIR, { recursive: true });
// Lines joined with a space: sentence punctuation in the script controls the pauses; no SSML needed.
let text = "";
const ranges = [];
for (const seg of script.segments) {
  if (text) text += " ";
  ranges.push({ id: seg.id, from: text.length, to: text.length + seg.text.length });
  text += seg.text;
}
console.log(`Recording one take: ${text.length} chars, ${text.split(/\s+/).length} words, voice ${profile.voiceId}...`);
const full = path.join(VO_DIR, "full.mp3");
const al = await tts(profile.voiceId, text, full);
if (al.characters.join("") !== text) console.warn("  ! alignment text differs from input; mapping by index anyway");
fs.writeFileSync(path.join(VO_DIR, "alignment.json"), JSON.stringify(al));
const T0 = al.character_start_times_seconds, T1 = al.character_end_times_seconds;
const total = probe(full);

// Speech span of each line: first/last non-space character.
const span = ranges.map((r) => {
  let a = r.from, b = r.to - 1;
  while (/\s/.test(text[a])) a++;
  while (/[\s]/.test(text[b])) b--;
  return { ...r, start: T0[a], end: T1[b] };
});

// Cut points: midpoint of the pause between consecutive lines (never inside a word).
const words = {};
const durations = {};
for (let i = 0; i < span.length; i++) {
  const s = span[i];
  const cutIn = i === 0 ? Math.max(0, s.start - 0.04) : (span[i - 1].end + s.start) / 2;
  const cutOut = i === span.length - 1 ? Math.min(total, s.end + 0.25) : (s.end + span[i + 1].start) / 2;
  const out = path.join(VO_DIR, `${s.id}.mp3`);
  const d = cutOut - cutIn;
  ffmpeg(["-ss", cutIn.toFixed(3), "-t", d.toFixed(3), "-i", full, "-af", `afade=t=in:d=0.03,afade=t=out:st=${Math.max(0, d - 0.03).toFixed(3)}:d=0.03`, "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", out]);
  durations[s.id] = Number(probe(out).toFixed(3));
  // Word timings relative to the stem start (for word-level sync in retime.mjs)
  const list = [];
  const re = /\S+/g;
  const lineText = text.slice(s.from, s.to);
  let m;
  while ((m = re.exec(lineText))) {
    const a = s.from + m.index, b = a + m[0].length - 1;
    list.push({ w: m[0], start: +(T0[a] - cutIn).toFixed(3), end: +(T1[b] - cutIn).toFixed(3) });
  }
  words[s.id] = list;
}
fs.writeFileSync(path.join(VO_DIR, "durations.json"), JSON.stringify(durations, null, 2) + "\n");
fs.writeFileSync(path.join(VO_DIR, "words.json"), JSON.stringify(words, null, 1) + "\n");
const nWords = text.split(/\s+/).length;
const speech = span[span.length - 1].end - span[0].start;
console.log(`Split into ${span.length} stems. Take ${total.toFixed(2)}s, speech ${speech.toFixed(2)}s, ${(nWords / (speech / 60)).toFixed(0)} wpm.`);
