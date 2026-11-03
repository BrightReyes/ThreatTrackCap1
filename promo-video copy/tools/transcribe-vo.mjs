// tools/transcribe-vo.mjs — Word-level timestamps for a user-supplied narration, via ElevenLabs Speech-to-Text.
// Usage: node tools/transcribe-vo.mjs audio/vo-user/nathan.mp3   → writes audio/vo-user/transcript.json
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./tl.mjs";

const file = path.resolve(ROOT, process.argv[2] || "audio/vo-user/nathan.mp3");
const out = path.join(path.dirname(file), "transcript.json");

let key = process.env.ELEVENLABS_API_KEY;
if (!key) {
  const m = fs.readFileSync(path.join(ROOT, ".env"), "utf8").match(/^\s*ELEVENLABS_API_KEY\s*=\s*"?([^"\r\n]+)"?/m);
  key = m?.[1]?.trim();
}
if (!key) throw new Error("Missing ELEVENLABS_API_KEY (.env)");

const form = new FormData();
form.append("model_id", "scribe_v1");
form.append("language_code", "eng");
form.append("timestamps_granularity", "word");
form.append("tag_audio_events", "false");
form.append("file", new Blob([fs.readFileSync(file)], { type: "audio/mpeg" }), path.basename(file));

const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": key }, body: form });
if (!res.ok) throw new Error(`STT ${res.status}: ${(await res.text()).slice(0, 400)}`);
const j = await res.json();
const words = (j.words || []).filter((w) => w.type === "word").map((w) => ({ w: w.text, start: +w.start.toFixed(3), end: +w.end.toFixed(3) }));
fs.writeFileSync(out, JSON.stringify({ text: j.text, words }, null, 1) + "\n");
console.log(`Wrote ${path.relative(ROOT, out)}: ${words.length} words.\n\n${j.text}`);
