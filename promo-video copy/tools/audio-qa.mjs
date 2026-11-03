// tools/audio-qa.mjs — Audio gates for the promo. Exit 1 on any failure.
//   1. VO non-overlap: seg.start + actual mp3 duration <= next cut − 0.25 s (CLAUDE.md §4.2)
//   2. No dead air: no stretch quieter than −45 dB longer than 0.8 s in audio/mix.wav (outside the end fade)
//   3. Loudness: integrated −14 ± 1 LUFS, true peak <= −0.9 dBFS
//   4. Every SFX cue maps to a time inside the film
//   5. (if renders/threattrack-promo.mp4 exists) it has audio + video, durations within 0.1 s, and is newer than mix.wav
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ROOT, SCENES, loadTL } from "./tl.mjs";

const TL = loadTL();
const D = TL.outDuration ?? TL.duration;
const errs = [];
const ok = (msg) => console.log(`  ✓ ${msg}`);
const probe = (f, entries) => execFileSync("ffprobe", ["-v", "error", "-show_entries", entries, "-of", "json", f]).toString();

// 1. VO placement
const vo = JSON.parse(fs.readFileSync(path.join(ROOT, "audio/vo-script.json"), "utf8"));
for (const seg of vo.segments) {
  const f = path.join(ROOT, `audio/vo/${seg.id}.mp3`);
  if (!fs.existsSync(f)) { errs.push(`VO ${seg.id}: missing ${path.relative(ROOT, f)}`); continue; }
  const dur = Number(JSON.parse(probe(f, "format=duration")).format.duration);
  const i = SCENES.indexOf(seg.scene);
  const nextCut = i < SCENES.length - 1 ? TL.out[SCENES[i + 1]].start : D;
  const slack = nextCut - 0.25 - (seg.start + dur);
  if (slack < -0.001) errs.push(`VO ${seg.id}: ends ${(-slack).toFixed(2)} s too late (start ${seg.start} + ${dur.toFixed(2)} > ${(nextCut - 0.25).toFixed(2)})`);
  if (seg.start < TL.out[seg.scene].start) errs.push(`VO ${seg.id}: starts before its scene`);
}
if (!errs.length) ok(`VO: ${vo.segments.length} lines, each ends ≥ 0.25 s before the next cut`);
const wordsFile = path.join(ROOT, "audio/vo/words.json");
if (fs.existsSync(wordsFile)) {
  const W = JSON.parse(fs.readFileSync(wordsFile, "utf8"));
  // Speech timing vs cuts: first word after the cut (no early speech) and within 0.35 s of it (no late speech).
  // s1 (hook) and s15 (logo build) start their line later on purpose.
  const DELIBERATE = new Set(["s1", "s15"]);
  let worst = 0;
  for (const seg of vo.segments) {
    const w0 = W[seg.id]?.[0];
    if (!w0) continue;
    const onset = seg.start + w0.start - TL.out[seg.scene].start;
    if (onset < 0) errs.push(`VO ${seg.id}: speech starts ${(-onset).toFixed(2)} s BEFORE its scene cut`);
    else if (!DELIBERATE.has(seg.scene) && onset > 0.35) errs.push(`VO ${seg.id}: speech starts late, ${onset.toFixed(2)} s after the cut`);
    if (!DELIBERATE.has(seg.scene)) worst = Math.max(worst, onset);
  }
  if (!errs.length) ok(`Speech onsets: every line starts 0–${worst.toFixed(2)} s after its cut (no early or late speech)`);
  let n = 0, secs = 0;
  for (const list of Object.values(W)) if (list.length) { n += list.length; secs += list[list.length - 1].end - list[0].start; }
  const wpm = (n / (secs / 60)).toFixed(0);
  console.log(`  · Pace: ${wpm} words/min while speaking (target 155–175)`);
}

// 2 + 3. Mix
const mix = path.join(ROOT, "audio/mix.wav");
if (!fs.existsSync(mix)) errs.push("audio/mix.wav missing — run node tools/mix.mjs");
else {
  const sd = spawnSync("ffmpeg", ["-hide_banner", "-i", mix, "-af", "silencedetect=n=-45dB:d=0.8", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const fadeStart = D - 2.2;
  const gaps = [...sd.matchAll(/silence_start: ([0-9.]+)/g)].map((m) => Number(m[1])).filter((t) => t > 0.3 && t < fadeStart);
  if (gaps.length) errs.push(`Dead air (>0.8 s below −45 dB) at: ${gaps.map((t) => t.toFixed(2)).join(", ")} s`);
  else ok("No dead air: nothing quieter than −45 dB for more than 0.8 s");

  const eb = spawnSync("ffmpeg", ["-hide_banner", "-i", mix, "-af", "ebur128=peak=true", "-f", "null", "-"], { encoding: "utf8" }).stderr;
  const I = Number(eb.match(/I:\s+(-?[0-9.]+) LUFS/g)?.pop().match(/-?[0-9.]+/)[0]);
  const peak = Number(eb.match(/Peak:\s+(-?[0-9.]+) dBFS/g)?.pop().match(/-?[0-9.]+/)[0]);
  if (!(Math.abs(I + 14) <= 1)) errs.push(`Loudness ${I} LUFS (want −14 ± 1)`);
  if (!(peak <= -0.9)) errs.push(`True peak ${peak} dBFS (want ≤ −0.9)`);
  if (Math.abs(I + 14) <= 1 && peak <= -0.9) ok(`Loudness ${I} LUFS, true peak ${peak} dBFS`);
}

// 4. Cues
const cues = JSON.parse(fs.readFileSync(path.join(ROOT, "audio/cues.json"), "utf8")).cues;
const badCues = cues.filter((c) => !(c.time >= 0 && c.time <= D));
if (badCues.length) errs.push(`${badCues.length} SFX cues outside the film`);
else ok(`${cues.length} SFX cues inside 0–${D}s`);

// 5. Final render
const mp4 = path.join(ROOT, "renders/threattrack-promo.mp4");
if (fs.existsSync(mp4)) {
  const info = JSON.parse(probe(mp4, "stream=codec_type,duration:format=duration"));
  const a = info.streams.find((s) => s.codec_type === "audio");
  const v = info.streams.find((s) => s.codec_type === "video");
  if (!a) errs.push("MP4 has no audio stream");
  if (!v) errs.push("MP4 has no video stream");
  if (a && v && Math.abs(Number(a.duration) - Number(v.duration)) > 0.1) errs.push(`MP4 audio ${a.duration}s vs video ${v.duration}s`);
  if (v && Math.abs(Number(v.duration) - D) > 0.2) errs.push(`MP4 video ${v.duration}s vs timeline ${D}s (stale render?)`);
  if (fs.existsSync(mix) && fs.statSync(mp4).mtimeMs < fs.statSync(mix).mtimeMs) errs.push("MP4 is older than audio/mix.wav — re-run the build");
  if (a && v) ok(`MP4: video ${Number(v.duration).toFixed(2)}s + audio ${Number(a.duration).toFixed(2)}s`);
} else console.log("  · renders/threattrack-promo.mp4 not built yet (skipped)");

if (errs.length) {
  console.error(`\n❌ AUDIO QA FAILED (${errs.length}):\n` + errs.map((e) => `  - ${e}`).join("\n"));
  process.exit(1);
}
console.log("\n✅ AUDIO QA PASSED");
