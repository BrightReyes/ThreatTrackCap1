// tools/build.mjs — Full promo build, VO-first:
//   VO → retime → cues → SFX → mix → silent render (HyperFrames) → mux → audio QA
// Usage: node tools/build.mjs                (reuse existing VO stems)
//        node tools/build.mjs --vo           (regenerate every VO stem first)
//        node tools/build.mjs --vo s6 s10    (regenerate only these lines)
//        node tools/build.mjs --audio-only   (stop after the mix; no video render)
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { ROOT } from "./tl.mjs";

const args = process.argv.slice(2);
const run = (cmd, argv) => {
  console.log(`\n▶ ${cmd} ${argv.join(" ")}`);
  execFileSync(cmd, argv, { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" && cmd === "npx" });
};

// VO engine: voiceProfile.engine in audio/vo-script.json ("elevenlabs" = one continuous take, the default;
// "edge" = offline edge-tts fallback, which also accepts per-line ids). Override with --engine edge.
const engine = args.includes("--engine") ? args[args.indexOf("--engine") + 1]
  : JSON.parse(fs.readFileSync(path.join(ROOT, "audio/vo-script.json"), "utf8")).voiceProfile?.engine || "elevenlabs";
// "user" = your own recording (voiceProfile.file): transcribed once for word timings, then cut per scene.
const voIdx = args.indexOf("--vo");
if (engine === "user") {
  const vp = JSON.parse(fs.readFileSync(path.join(ROOT, "audio/vo-script.json"), "utf8")).voiceProfile;
  const transcript = path.join(ROOT, path.dirname(vp.file), "transcript.json");
  if (!fs.existsSync(transcript) || voIdx !== -1) run("node", ["tools/transcribe-vo.mjs", vp.file]);
  run("node", ["tools/import-vo.mjs"]); // cheap and deterministic: always re-cut from the recording
} else {
  const voTool = engine === "edge" ? "tools/generate-vo.mjs" : "tools/generate-vo-eleven.mjs";
  if (voIdx !== -1) run("node", [voTool, ...(engine === "edge" ? args.slice(voIdx + 1).filter((a) => !a.startsWith("--")) : [])]);
  else if (!fs.existsSync(path.join(ROOT, "audio/vo/durations.json"))) run("node", [voTool]);
}

run("node", ["tools/retime.mjs"]);
run("node", ["tools/cues.mjs"]);
run("node", ["tools/render-sfx.mjs"]);
run("node", ["tools/mix.mjs"]);
if (args.includes("--audio-only")) process.exit(0);

fs.mkdirSync(path.join(ROOT, "renders"), { recursive: true });
const silent = path.join(ROOT, "renders/promo-silent.mp4");
const final = path.join(ROOT, "renders/threattrack-promo.mp4");
// Relative path on purpose: npx runs through a shell on Windows, and the folder name contains a space.
run("npx", ["--yes", "hyperframes@0.8.146", "render", ".", "--output", "renders/promo-silent.mp4", "--quality", "high"]);
run("ffmpeg", ["-hide_banner", "-v", "error", "-y", "-i", silent, "-i", path.join(ROOT, "audio/mix.wav"),
  "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy", "-c:a", "aac", "-b:a", "256k", "-movflags", "+faststart", "-shortest", final]);
run("node", ["tools/audio-qa.mjs"]);
console.log(`\nDone → ${path.relative(ROOT, final)}`);
