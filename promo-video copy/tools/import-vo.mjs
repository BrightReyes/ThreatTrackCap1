// tools/import-vo.mjs — Use a user-supplied narration (one continuous recording) as the VO.
//
// Input : audio/vo-user/<file>.mp3 + audio/vo-user/transcript.json (word timestamps, from tools/transcribe-vo.mjs)
//         audio/vo-script.json segments = the recording's words, split per scene (the text must match the
//         transcript word-for-word, ignoring case/punctuation — checked below).
// Output: audio/vo/<id>.mp3 (one stem per scene, cut on word boundaries, never mid-word),
//         audio/vo/durations.json, audio/vo/words.json (word times relative to each stem) → used by retime.mjs.
// The voice itself is never time-stretched or re-ordered: each stem is the exact recorded audio.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./tl.mjs";

const script = JSON.parse(fs.readFileSync(path.join(ROOT, "audio/vo-script.json"), "utf8"));
const src = path.join(ROOT, script.voiceProfile.file);
const tr = JSON.parse(fs.readFileSync(path.join(path.dirname(src), "transcript.json"), "utf8"));
const W = tr.words;
const VO = path.join(ROOT, "audio/vo");
fs.mkdirSync(VO, { recursive: true });

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9']/g, "");
const probe = (f) => Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString());
const total = probe(src);

// 1. Map each segment to its word range, verifying the text matches the recording.
let wi = 0;
const ranges = script.segments.map((seg) => {
  const toks = seg.text.split(/\s+/).filter(Boolean);
  const from = wi;
  for (const t of toks) {
    if (!W[wi] || norm(W[wi].w) !== norm(t)) throw new Error(`${seg.id}: script word "${t}" ≠ recording word "${W[wi]?.w}" (#${wi})`);
    wi++;
  }
  return { id: seg.id, from, to: wi - 1 };
});
if (wi !== W.length) throw new Error(`Script covers ${wi} of ${W.length} recorded words`);

// 2. Refine line boundaries against the actual audio. Speech-to-text word times are typically 10–110 ms late,
//    so each line's true onset/offset is found from the loudness envelope (10 ms RMS frames): walk back from the
//    transcribed first-word start while the signal is above the speech floor, and forward from the last-word end.
const FRAME = 0.01, FLOOR = -40; // dBFS
const env = (() => {
  const out = execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-i", src, "-af",
    `aresample=48000,asetnsamples=${48000 * FRAME},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.RMS_level:file=-`, "-f", "null", "-"], { maxBuffer: 64 * 1024 * 1024 }).toString();
  return [...out.matchAll(/RMS_level=(-?[0-9.]+|-inf)/g)].map((m) => (m[1] === "-inf" ? -120 : Number(m[1])));
})();
const lvl = (t) => env[Math.max(0, Math.min(env.length - 1, Math.floor(t / FRAME)))];
const lines = ranges.map((r) => ({ ...r, s: W[r.from].start, e: W[r.to].end }));
lines.forEach((L, i) => {
  const minS = i ? lines[i - 1].e + 0.05 : 0;
  let s = L.s;
  for (let t = L.s; t >= Math.max(minS, L.s - 0.25); t -= FRAME) { if (lvl(t) > FLOOR) s = t; else if (t < L.s - 0.02) break; }
  L.bias = s - L.s; // ≤ 0: how early the real onset is vs the transcript
  L.s = s;
});
lines.forEach((L, i) => {
  const maxE = i < lines.length - 1 ? lines[i + 1].s - 0.05 : total;
  let e = L.e;
  for (let t = L.e; t <= Math.min(maxE, L.e + 0.3); t += FRAME) { if (lvl(t) > FLOOR) e = t + FRAME; else if (t > L.e + 0.02) break; }
  L.e = e;
});

// 3. Cut points sit in the real pause between lines: pad = half the pause, capped, so no syllable is clipped
//    and no neighbouring speech leaks in.
const PRE = 0.08, POST = 0.12;
const durations = {}, words = {}, report = [];
lines.forEach((L, i) => {
  const r = L;
  const gapBefore = i === 0 ? L.s : L.s - lines[i - 1].e;
  const gapAfter = i === lines.length - 1 ? total - L.e : lines[i + 1].s - L.e;
  const a = Math.max(0, L.s - Math.min(PRE, gapBefore / 2));
  const b = Math.min(total, L.e + Math.min(i === lines.length - 1 ? 0.35 : POST, gapAfter / 2));
  report.push(`${L.id.padEnd(4)} onset corrected ${(L.bias * 1000).toFixed(0).padStart(4)} ms · pause before ${gapBefore.toFixed(2)} s`);
  const out = path.join(VO, `${r.id}.mp3`);
  const d = b - a;
  execFileSync("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-ss", a.toFixed(3), "-t", d.toFixed(3), "-i", src,
    "-af", `afade=t=in:d=0.012,afade=t=out:st=${Math.max(0, d - 0.02).toFixed(3)}:d=0.02`, "-ar", "48000", "-ac", "1", "-c:a", "libmp3lame", "-q:a", "2", out]);
  durations[r.id] = Number(probe(out).toFixed(3));
  // shift the line's word times by the measured transcript error so sync uses the real audio
  words[r.id] = W.slice(r.from, r.to + 1).map((w) => ({ w: w.w, start: +Math.max(0, w.start + L.bias - a).toFixed(3), end: +(w.end + L.bias - a).toFixed(3) }));
});
fs.writeFileSync(path.join(VO, "durations.json"), JSON.stringify(durations, null, 2) + "\n");
fs.writeFileSync(path.join(VO, "words.json"), JSON.stringify(words, null, 1) + "\n");
const sum = Object.values(durations).reduce((x, y) => x + y, 0);
console.log(report.join("\n"));
console.log(`Imported ${ranges.length} lines from ${path.relative(ROOT, src)} (${total.toFixed(2)}s recording, ${sum.toFixed(2)}s of stems).`);
