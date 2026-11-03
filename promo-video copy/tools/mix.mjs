// tools/mix.mjs — Final soundtrack: VO stems + ducked CC0 music bed + rendered SFX → audio/mix.wav
//   VO    audio/vo/<id>.mp3 placed at seg.start (from tools/retime.mjs)
//   Music audio/music/called-to-win.mp3, sidechain-ducked under the VO, faded in/out
//   SFX   audio/sfx.wav (tools/render-sfx.mjs)
// Two-pass loudnorm to -14 LUFS integrated, -1 dBTP.
import fs from "node:fs";
import path from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { ROOT, loadTL } from "./tl.mjs";

const TL = loadTL();
const D = TL.outDuration ?? TL.duration;
const vo = JSON.parse(fs.readFileSync(path.join(ROOT, "audio/vo-script.json"), "utf8"));

const MUSIC = path.join(ROOT, "audio/music/called-to-win.mp3");
const MUSIC_OFFSET = 1.5; // the track opens with ~1.49 s of silence
const MUSIC_GAIN_DB = -10; // bed level before ducking
const SFX_GAIN_DB = -6;
const OUT = path.join(ROOT, "audio/mix.wav");

for (const f of [MUSIC, path.join(ROOT, "audio/sfx.wav")]) {
  if (!fs.existsSync(f)) throw new Error(`Missing ${path.relative(ROOT, f)} — run the earlier build steps (see tools/build.mjs)`);
}

const inputs = [];
const chains = [];
vo.segments.forEach((seg, i) => {
  inputs.push("-i", path.join(ROOT, `audio/vo/${seg.id}.mp3`));
  const ms = Math.round(seg.start * 1000);
  chains.push(`[${i}:a]aresample=48000,aformat=channel_layouts=stereo,adelay=${ms}|${ms}[v${i}]`);
});
const nVo = vo.segments.length;
inputs.push("-i", MUSIC, "-i", path.join(ROOT, "audio/sfx.wav"));
const mIdx = nVo, sIdx = nVo + 1;

const fadeOut = Math.max(0, D - 2.2).toFixed(3);
chains.push(
  `${vo.segments.map((_, i) => `[v${i}]`).join("")}amix=inputs=${nVo}:normalize=0:dropout_transition=0,apad,atrim=0:${D},asplit=2[vo][vokey]`,
  `[${mIdx}:a]atrim=start=${MUSIC_OFFSET},asetpts=PTS-STARTPTS,aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${D},` +
    `volume=${MUSIC_GAIN_DB}dB,afade=t=in:st=0:d=0.8,afade=t=out:st=${fadeOut}:d=2.2[mus]`,
  // Duck ~6–7 dB under the (denser, faster) narration; quicker release so the bed breathes between lines.
  `[mus][vokey]sidechaincompress=threshold=0.03:ratio=5:attack=20:release=250:makeup=1[bed]`,
  `[${sIdx}:a]aresample=48000,aformat=channel_layouts=stereo,apad,atrim=0:${D},volume=${SFX_GAIN_DB}dB[sfx]`,
  `[vo][bed][sfx]amix=inputs=3:normalize=0:dropout_transition=0[pre]`
);
const graph = chains.join(";");

function ffmpeg(args) {
  const r = spawnSync("ffmpeg", ["-hide_banner", "-y", ...args], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) throw new Error(r.stderr.split("\n").slice(-15).join("\n"));
  return r.stderr;
}

// Pass 1: measure
const log = ffmpeg([...inputs, "-filter_complex", `${graph};[pre]loudnorm=I=-14:TP=-1:LRA=11:print_format=json[o]`, "-map", "[o]", "-f", "null", "-"]);
const m = JSON.parse(log.slice(log.lastIndexOf("{"), log.lastIndexOf("}") + 1));

// Pass 2: apply (linear) and write
const ln = `loudnorm=I=-14:TP=-1:LRA=11:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
ffmpeg([...inputs, "-filter_complex", `${graph};[pre]${ln},aresample=48000,asetpts=N/SR/TB,apad,atrim=0:${D}[o]`, "-map", "[o]", "-c:a", "pcm_s16le", OUT]);

const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", OUT]).toString());
console.log(`Wrote audio/mix.wav (${dur.toFixed(2)}s; pre-norm ${m.input_i} LUFS → -14 LUFS target).`);
