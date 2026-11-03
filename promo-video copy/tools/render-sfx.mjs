// tools/render-sfx.mjs — Render audio/cues.json through the SAME Web Audio engine used in preview
// (assets/audio-engine.js) into audio/sfx.wav, using an OfflineAudioContext in headless Chromium.
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { ROOT } from "./tl.mjs";

const RATE = 48000;
const engineSrc = fs.readFileSync(path.join(ROOT, "assets/audio-engine.js"), "utf8").replace(/^export\s+/m, "");
const cuesDoc = JSON.parse(fs.readFileSync(path.join(ROOT, "audio/cues.json"), "utf8"));

const browser = await chromium.launch();
const page = await browser.newPage();
const pcm = await page.evaluate(
  async ({ engineSrc, cuesDoc, RATE }) => {
    const ThreatTrackAudioEngine = new Function(`${engineSrc}\n;return ThreatTrackAudioEngine;`)();
    const len = Math.ceil((cuesDoc.duration + 0.5) * RATE);
    const ctx = new OfflineAudioContext(1, len, RATE);
    const engine = new ThreatTrackAudioEngine(ctx);
    engine.cues = cuesDoc.cues;
    engine.renderAll();
    const buf = await ctx.startRendering();
    return Array.from(buf.getChannelData(0));
  },
  { engineSrc, cuesDoc, RATE }
);
await browser.close();

// 16-bit mono WAV
const n = pcm.length;
const out = Buffer.alloc(44 + n * 2);
out.write("RIFF", 0); out.writeUInt32LE(36 + n * 2, 4); out.write("WAVE", 8);
out.write("fmt ", 12); out.writeUInt32LE(16, 16); out.writeUInt16LE(1, 20); out.writeUInt16LE(1, 22);
out.writeUInt32LE(RATE, 24); out.writeUInt32LE(RATE * 2, 28); out.writeUInt16LE(2, 32); out.writeUInt16LE(16, 34);
out.write("data", 36); out.writeUInt32LE(n * 2, 40);
let peak = 0;
for (let i = 0; i < n; i++) {
  const v = Math.max(-1, Math.min(1, pcm[i]));
  peak = Math.max(peak, Math.abs(v));
  out.writeInt16LE(Math.round(v * 32767), 44 + i * 2);
}
fs.writeFileSync(path.join(ROOT, "audio/sfx.wav"), out);
console.log(`Wrote audio/sfx.wav (${(n / RATE).toFixed(2)}s, ${cuesDoc.cues.length} cues, peak ${peak.toFixed(2)}).`);
