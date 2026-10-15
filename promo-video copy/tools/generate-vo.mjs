// tools/generate-vo.mjs — Generates real Neural TTS MP3 files with zero API keys
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const scriptPath = path.resolve("./audio/vo-script.json");
const outDir = path.resolve("./audio/vo");
fs.mkdirSync(outDir, { recursive: true });

const script = JSON.parse(fs.readFileSync(scriptPath, "utf8"));
const voice = script.voiceProfile?.voice || "en-US-BrianNeural";
const rate = script.voiceProfile?.rate || "+12%";
const pitch = script.voiceProfile?.pitch || "+2Hz";

console.log(`Generating ${script.segments.length} upbeat neural VO stems using ${voice}...`);

for (const seg of script.segments) {
  const outFile = path.join(outDir, `${seg.id}.mp3`);
  try {
    execFileSync(
      "python",
      [
        "-m",
        "edge_tts",
        "--voice",
        voice,
        `--rate=${rate}`,
        `--pitch=${pitch}`,
        "--text",
        seg.text,
        "--write-media",
        outFile
      ],
      { stdio: "inherit" }
    );
    console.log(`✓ Saved ${outFile}`);
  } catch (err) {
    console.warn(`edge_tts execution failed, attempting reinstall via python -m pip...`, err);
    execFileSync("python", ["-m", "pip", "install", "edge-tts"], { stdio: "inherit" });
    execFileSync(
      "python",
      [
        "-m",
        "edge_tts",
        "--voice",
        voice,
        `--rate=${rate}`,
        `--pitch=${pitch}`,
        "--text",
        seg.text,
        "--write-media",
        outFile
      ],
      { stdio: "inherit" }
    );
  }
}

console.log("All 15 Neural VO MP3 files generated in ./audio/vo/!");
