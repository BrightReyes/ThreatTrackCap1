// tools/generate-vo.mjs — Neural TTS VO stems via edge-tts (no API key), trimmed to speech, with measured durations.
// Usage: node tools/generate-vo.mjs            (all segments)
//        node tools/generate-vo.mjs s6 s10     (only these ids; the rest are re-trimmed from their raw files)
//
// Writes audio/vo/<id>.raw.mp3 (untouched TTS output) and audio/vo/<id>.mp3 (leading/trailing silence
// removed, 40 ms pad each side), plus audio/vo/durations.json measured from the trimmed files.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./tl.mjs";
const scriptPath = path.join(ROOT, "audio/vo-script.json");
const outDir = path.join(ROOT, "audio/vo");
fs.mkdirSync(outDir, { recursive: true });

const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
const { voice = "en-US-AndrewNeural", rate = "+0%", pitch = "+0Hz" } = script.voiceProfile || {};
const only = new Set(process.argv.slice(2));
const segments = script.segments.filter((s) => only.size === 0 || only.has(s.id));

function probeDuration(file) {
  const out = execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", file]);
  return Number(out.toString().trim());
}

const sleep = (ms) => execFileSync("node", ["-e", `setTimeout(()=>{}, ${ms})`]);

function synth(seg, rawFile) {
  const args = ["-m", "edge_tts", "--voice", voice, `--rate=${rate}`, `--pitch=${pitch}`, "--text", seg.text, "--write-media", rawFile];
  for (let attempt = 1; ; attempt++) {
    try {
      execFileSync("python", args, { stdio: ["ignore", "ignore", "pipe"], timeout: 60000 });
      if (!(probeDuration(rawFile) > 0.3)) throw new Error("stem too short");
      return;
    } catch (err) {
      // edge-tts talks to a remote service; transient socket errors and hangs happen.
      if (attempt >= 4) throw new Error(`edge-tts failed for ${seg.id}: ${err.stderr?.toString().trim().split("\n").pop() || err.message}`);
      console.warn(`  ! ${seg.id} attempt ${attempt} failed, retrying...`);
      sleep(1500 * attempt);
    }
  }
}

// Strip silence at both ends (-45 dB), then pad 40 ms so consonant onsets/tails aren't clipped.
function trim(rawFile, outFile) {
  const strip = "silenceremove=start_periods=1:start_threshold=-45dB:start_silence=0.04";
  const af = `${strip},areverse,${strip},areverse`;
  execFileSync("ffmpeg", ["-y", "-v", "error", "-i", rawFile, "-af", af, "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", outFile]);
}

console.log(`Generating ${segments.length} VO stems with ${voice} (rate ${rate}, pitch ${pitch})...`);
for (const seg of segments) {
  synth(seg, path.join(outDir, `${seg.id}.raw.mp3`));
  console.log(`  ✓ ${seg.id}`);
}

const durations = {};
for (const seg of script.segments) {
  const raw = path.join(outDir, `${seg.id}.raw.mp3`);
  const mp3 = path.join(outDir, `${seg.id}.mp3`);
  if (!fs.existsSync(raw) && fs.existsSync(mp3)) fs.renameSync(mp3, raw); // one-time migration of untrimmed stems
  if (!fs.existsSync(raw)) continue;
  trim(raw, mp3);
  durations[seg.id] = Number(probeDuration(mp3).toFixed(3));
}
fs.writeFileSync(path.join(outDir, "durations.json"), JSON.stringify(durations, null, 2) + "\n");
console.log(`Trimmed ${Object.keys(durations).length} stems; wrote audio/vo/durations.json.`);
