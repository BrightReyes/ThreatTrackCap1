// Builds audio/cues.json for opus-sound-layer from timeline.js (v2 cut). Run: node tools/cues.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const src = readFileSync(new URL("../timeline.js", import.meta.url), "utf8");
const T = new Function(src.replace(/if \(typeof window[^\n]*\n/, "") + "; return TL;")();

// music bed: CC0 "Confident Session" (Kevin MacLeod) trimmed to the film + fade
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", "audio/music-candidates/confident-session.mp3", "-t", String(T.duration + 4), "-ac", "2", "-ar", "48000", "audio/music.wav"]);

// Sonic family: wood + air + glass. Heroes "thump+tap" with a reverse build and a dead stop.
const THUMP = "thump/fs-133282-thump-on-carpet-2";
const TAPH = "tap/kenney-impact-impact-wood-light-000";
const TAP = ["tap/kenney-impact-impact-wood-light-002", "tap/kenney-impact-impact-wood-light-001", "tap/kenney-impact-impact-wood-light-003"];
const WHOOSH = ["whoosh/fs-30240-swoop1-flac-1", "whoosh/fs-30241-swoop2g-flac-1"];
const SWISH = ["swish/kenney-rpg-cloth1", "swish/fs-14175-27-wav-2", "swish/fs-14171-23-wav-1"];
const CLICK = "click/kenney-ui-audio-click2";
const CLICK_HEAVY = "click/kenney-ui-audio-switch10";
const POP = ["pop/fs-269583-bubble-1", "pop/fs-507006-soap-bubbles-pop-1", "pop/fs-796298-bubble-pop-2"];
const TICK = ["tick/fs-188033-ticking-clock-1", "tick/fs-130388-clock-ticking-2"];
const KEY = ["key/fs-180974-key-1", "key/fs-194799-keyboard5-wav-1", "key/fs-194796-vintage-keyboard-2-1"];
const CHIME = "chime/kenney-interface-glass-001";
const CHIME_SOFT = "chime/fs-570243-point-in-space-ogg-1";
const RISER_HERO = "riser/fs-503801-reverse-fx-3-wav-1";
const RISER_LONG = "riser/fs-334525-rise5-wav-1";
const TRANSITION = "transition/fs-444623-swoosh-10-wav-1";
const SHIMMER = "shimmer/fs-449645-transition-action-jump-pitch-1";

const cues = [];
let n = 0;
const add = (id, t, sound, extra = {}) => cues.push({ id: `${id}-${n++}`, t: +t.toFixed(3), sound, weight: "support", align: "peak", ...extra });
const pick = (arr, i) => arr[i % arr.length];
const hero = (id, t, pan = 0, visual = "land") => {
  add(id, t, `${THUMP}+boom`, { weight: "hero", visual, pan, stop_before: true, build: true }); // boom layer: main band drops under the music
  add(id + "-build", t, RISER_HERO, { weight: "support" });
};
// every block wipe: one air whoosh peaking mid-wipe (the frame changes fastest there)
const wipe = (id, cut) => add(id, cut + T.wipe * 0.45, pick(WHOOSH, n), { visual: "cut", pan: -0.2 });

// S1 intro
{ const S = T.s1;
  add("s1-line", S.line + 0.3, SWISH[2], { visual: "move" });
  add("s1-pulse", S.line + 0.9, pick(TICK, 0), { visual: "move" });
  hero("logo", S.logo + 0.05, 0, "appear");
  add("s1-word", S.word + 0.1, SWISH[1], { visual: "appear" });
  add("s1-tag", S.tag + 0.1, pick(POP, 0), { visual: "appear" });
}
// S2 typographic beat
{ const S = T.s2;
  wipe("s2-wipe", S.start);
  [S.l1, S.l2, S.l3].forEach((t, i) => add("s2-line", t + 0.12, i === 1 ? pick(TAP, 1) : SWISH[i % 3], { visual: "appear", pan: -0.3 }));
}
// S3 SOS
{ const S = T.s3;
  wipe("s3-wipe", S.start);
  add("s3-card", S.card + 0.3, pick(TAP, 0), { visual: "land", pan: -0.3 });
  add("s3-head", S.head + 0.5, SWISH[0], { visual: "appear", pan: 0.3 });
  add("s3-press", S.press, CLICK, { visual: "land", pan: -0.3 });
  add("s3-hold", S.release, RISER_LONG, { weight: "support", pan: -0.3 });
  hero("sos-release", S.release + 0.05, -0.3, "move");
  add("s3-gate", S.sent - 0.05, SWISH[1], { visual: "move", pan: -0.3 });
  [S.sent, S.row1, S.row2].forEach((t, i) => add("s3-row", t + 0.1, pick(TICK, i), { visual: "appear", pan: -0.3 }));
  add("s3-assigned", S.row3 + 0.1, CHIME_SOFT, { visual: "appear", pan: -0.3 });
}
// S4 report
{ const S = T.s4;
  wipe("s4-wipe", S.start);
  add("s4-phone", S.phone + 0.1, WHOOSH[1], { visual: "move", pan: 0.35 });
  add("s4-land", S.phone + 0.75, pick(TAP, 1), { visual: "land", pan: 0.35 });
  add("s4-head", S.head + 0.5, SWISH[0], { visual: "appear", pan: -0.3 });
  add("s4-chip", S.chip, CLICK, { visual: "land", pan: 0.35 });
  add("s4-role", S.role, CLICK, { visual: "land", pan: 0.35 });
  add("s4-photo", S.photo + 0.05, pick(POP, 1), { visual: "appear", pan: 0.35 });
  add("s4-submit", S.submit, CLICK_HEAVY, { visual: "land", pan: 0.35 });
  add("s4-sent", S.sent + 0.1, CHIME, { visual: "appear", pan: 0.35 });
}
// S5 status
{ const S = T.s5;
  wipe("s5-wipe", S.start);
  add("s5-card", S.card + 0.3, pick(TAP, 2), { visual: "land", pan: -0.3 });
  add("s5-head", S.head + 0.5, SWISH[1], { visual: "appear", pan: 0.3 });
  [S.p1, S.p2, S.p3].forEach((t, i) => add("s5-step", t + 0.05, pick(TICK, i), { visual: "appear", pan: -0.3 }));
  add("s5-responding", S.p4 + 0.05, CHIME, { visual: "appear", pan: -0.3 });
  add("s5-done", S.p5 + 0.05, CHIME_SOFT, { visual: "appear", pan: -0.3 });
}
// S6 command center
{ const S = T.s6;
  wipe("s6-wipe", S.start);
  hero("dashboard", S.card + 0.65, -0.2);
  add("s6-head", S.head + 0.5, SWISH[0], { visual: "appear", pan: 0.3 });
  [0, 1, 2].forEach((i) => add("s6-stat", S.stats + 0.2 + i * 0.3, pick(TICK, i), { visual: "appear", pan: -0.3 }));
  add("s6-row-in", S.newRow + 0.1, SWISH[2], { visual: "move", pan: -0.3 });
  add("s6-alert", S.flash + 0.02, CHIME, { visual: "appear", pan: -0.3 });
}
// S7 split
{ const S = T.s7;
  wipe("s7-wipe", S.start);
  add("s7-left", S.left + 0.2, pick(TAP, 0), { visual: "land", pan: -0.4 });
  add("s7-right", S.right + 0.2, pick(TAP, 1), { visual: "land", pan: 0.4 });
  add("s7-score-build", S.scoreEnd, RISER_HERO, { weight: "support", pan: 0.4 });
  add("s7-verdict", S.verdict + 0.05, CHIME, { visual: "appear", pan: 0.4 });
  add("s7-cursor", S.verdict + 0.3, SWISH[0], { visual: "move", pan: 0.4 });
  hero("dispatch", S.click + 0.17, 0.4, "move");
  add("s7-way", S.way + 0.1, CHIME_SOFT, { visual: "appear", pan: -0.4 });
}
// S8 hotspot grid
{ const S = T.s8;
  wipe("s8-wipe", S.start);
  add("s8-lbl", S.title + 0.1, SWISH[1], { visual: "appear", pan: -0.3 });
  for (let r = 0; r < 6; r++) add("s8-tilerow", S.tiles + r * 0.12 + 0.15, pick(TAP, r), { visual: "appear", pan: -0.4 + r * 0.05 });
  add("s8-card", S.card + 0.3, pick(TAP, 0), { visual: "land", pan: 0.3 });
  [S.r1, S.r2, S.r3].forEach((t, i) => add("s8-hot", t + 0.1, pick(POP, i), { visual: "appear", pan: 0.3 }));
}
// S9 AI
{ const S = T.s9;
  wipe("s9-wipe", S.start);
  add("s9-card", S.card + 0.3, pick(TAP, 2), { visual: "land", pan: -0.3 });
  add("s9-head", S.head + 0.5, SWISH[1], { visual: "appear", pan: 0.3 });
  for (let i = 0; i < 6; i++) add("s9-key", S.typeStart + 0.1 + i * ((S.typeEnd - S.typeStart - 0.2) / 5), pick(KEY, i), { visual: "appear", pan: -0.3 });
  add("s9-guard", S.guard + 0.05, CHIME, { visual: "appear", pan: -0.3 });
}
// S10 chips
{ const S = T.s10;
  wipe("s10-wipe", S.start);
  add("s10-glow", S.title + 0.1, SHIMMER, { visual: "appear" });
  add("s10-title", S.title + 0.2, SWISH[0], { visual: "appear" });
  for (let i = 0; i < 15; i += 2) add("s10-chip", S.chips + i * ((S.chipsEnd - S.chips) / 15) + 0.05, pick(TICK, i), { visual: "appear", pan: -0.4 + (i % 5) * 0.2 });
}
// S11 outro
{ const S = T.s11;
  wipe("s11-wipe", S.start);
  hero("outro", S.glow + 0.35);
  add("s11-word", S.word + 0.1, SWISH[1], { visual: "appear" });
  add("s11-tag", S.tag + 0.1, pick(POP, 0), { visual: "appear" });
  add("s11-pill", S.pill + 0.05, pick(POP, 2), { visual: "appear" });
}

// decluster: mix.py drops any support cue within 0.15 s of the previous one, which qa.py then flags
cues.sort((a, b) => a.t - b.t);
let last = -1; const kept = [];
for (const c of cues) { if (c.weight !== "hero" && c.t - last < 0.25) continue; kept.push(c); last = c.t; }

const sheet = {
  fps: T.fps, duration_s: T.duration, energy: "punchy", lufs: -14, kit: "audio/kit",
  room: { decay_s: 0.5, wet_db: -18 },
  music: { file: "audio/music.wav", start_s: 0, loop: false, fade_out_s: 1.4 },
  duck_db: 10, cues: kept
};
writeFileSync(new URL("../audio/cues.json", import.meta.url), JSON.stringify(sheet, null, 2));
console.log(`${kept.length} cues (of ${cues.length}) → audio/cues.json`);
