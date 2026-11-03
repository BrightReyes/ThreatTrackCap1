// tools/cues.mjs — Build audio/cues.json (OUTPUT time) from audio/cues.src.json (SOURCE time).
// Source cue times use the same seconds as anim.js, so after any retime the SFX still land on the
// exact animation beat: output = TL.warp(source). Durations of long cues (risers) are warped too.
import fs from "node:fs";
import path from "node:path";
import { ROOT, loadTL } from "./tl.mjs";

const TL = loadTL();
const src = JSON.parse(fs.readFileSync(path.join(ROOT, "audio/cues.src.json"), "utf8"));
const W = TL.warpEdge || TL.warp; // same mapping as anim.js: lead-ins to a beat stay in real time

const cues = src.cues.map((c) => {
  const time = +W(c.time).toFixed(3);
  const out = { ...c, time, srcTime: c.time };
  if (c.duration && c.duration >= 1.0) out.duration = +(W(c.time + c.duration) - W(c.time)).toFixed(3);
  return out;
});

const duration = TL.outDuration ?? TL.duration;
const late = cues.filter((c) => c.time > duration);
if (late.length) throw new Error(`Cues past the end of the film: ${late.map((c) => c.note).join(", ")}`);

fs.writeFileSync(
  path.join(ROOT, "audio/cues.json"),
  JSON.stringify({ version: "3.0", generatedBy: "tools/cues.mjs — do not hand-edit; edit audio/cues.src.json", duration, cues }, null, 2) + "\n"
);
console.log(`Wrote ${cues.length} cues to audio/cues.json (film ${duration}s).`);
