// Builds audio/cues.json for opus-sound-layer from timeline.js (v5 cut). Run: node tools/cues.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const src = readFileSync(new URL("../timeline.js", import.meta.url), "utf8");
const T = new Function(src.replace(/if \(typeof window[^\n]*\n/, "") + "; return TL;")();

// music bed: CC0 "Called to Win" (Public Domain Background Tracks, Internet Archive), trimmed to the film + fade
execFileSync("ffmpeg", ["-v", "error", "-y", "-i", "audio/music-candidates/called-to-win.mp3", "-t", String(T.duration + 4), "-ac", "2", "-ar", "48000", "audio/music.wav"]);

const THUMP = "thump/fs-133282-thump-on-carpet-2";
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
const hero = (id, t, pan = 0, visual = "land") => { add(id, t, "hit+boom", { weight: "hero", visual, pan, stop_before: true, build: true }); add(id + "-build", t, RISER_HERO, { weight: "support" }); };
// kinetic word: a short air swish per snap (Apple cuts carry a soft whoosh)
const word = (id, t, pan = 0) => add(id, t + 0.08, pick(SWISH, n), { visual: "appear", pan });
const cut = (id, t) => add(id, t + 0.05, pick(WHOOSH, n), { visual: "cut" });

{ const S = T.s1; add("s1-radar", S.radar + 0.4, pick(TICK, 0), { visual: "move" }); hero("logo", S.logo + 0.07, 0, "appear"); word("s1-word", S.word); }
{ const S = T.s2; cut("s2", S.start); word("s2-w1", S.w1, -0.2); word("s2-w2", S.w2, 0.2); }
{ const S = T.s3; cut("s3", S.start); word("s3-w1", S.w1); add("s3-glow", S.w1 + 0.1, SHIMMER, { visual: "appear" }); word("s3-w2", S.w2, -0.2); word("s3-w3", S.w3, 0.2); }
{ const S = T.s4; for (let i = 0; i < 6; i += 2) add("s4-shot", S.fly + i * 0.07 + 0.3, pick(TAP, i), { visual: "land", pan: -0.4 + i * 0.15 }); add("s4-icons", S.settle + 0.2, pick(TICK, 1), { visual: "appear" }); add("s4-zoom", S.zoom + 0.1, WHOOSH[1], { visual: "move" }); }
{ const S = T.s5; cut("s5", S.start); [S.a, S.b, S.c].forEach((t, i) => add("s5-word", t + 0.05, pick(TAP, i), { visual: "appear", pan: -0.3 + i * 0.3 })); }
{ const S = T.s6; cut("s6", S.start); word("s6-head", S.head, -0.3); add("s6-card", S.card + 0.35, pick(TAP, 0), { visual: "land", pan: 0.3 }); add("s6-press", S.press, CLICK, { visual: "land", pan: 0.3 }); add("s6-hold", S.release, RISER_LONG, { weight: "support", pan: 0.3 }); hero("sos-release", S.release + 0.05, 0.3, "move"); [S.sent, S.row1, S.row2].forEach((t, i) => add("s6-row", t + 0.1, pick(TICK, i), { visual: "appear", pan: 0.3 })); add("s6-assigned", S.row3 + 0.1, CHIME_SOFT, { visual: "appear", pan: 0.3 }); }
{ const S = T.s7; cut("s7", S.start); word("s7-head", S.head, -0.3); add("s7-phone", S.phone + 0.1, WHOOSH[1], { visual: "move", pan: 0.35 }); add("s7-chip", S.chip, CLICK, { visual: "land", pan: 0.35 }); add("s7-role", S.role, CLICK, { visual: "land", pan: 0.35 }); add("s7-photo", S.photo + 0.05, pick(POP, 1), { visual: "appear", pan: 0.35 }); add("s7-submit", S.submit, CLICK_HEAVY, { visual: "land", pan: 0.35 }); add("s7-sent", S.sent + 0.1, CHIME, { visual: "appear", pan: 0.35 }); }
{ const S = T.s8; word("s8-head", S.head, -0.3); add("s8-card", S.card + 0.35, pick(TAP, 2), { visual: "land", pan: 0.3 }); [S.p1, S.p2, S.p3].forEach((t, i) => add("s8-step", t + 0.05, pick(TICK, i), { visual: "appear", pan: 0.3 })); add("s8-responding", S.p4 + 0.05, CHIME, { visual: "appear", pan: 0.3 }); add("s8-done", S.p5 + 0.05, CHIME_SOFT, { visual: "appear", pan: 0.3 }); }
{ const S = T.s9; cut("s9", S.start); word("s9-head", S.head, -0.3); hero("dashboard", S.card + 0.45, 0.3, "appear"); add("s9-stat", S.stats + 0.5, pick(TICK, 1), { visual: "appear", pan: 0.3 }); add("s9-row-in", S.newRow + 0.1, SWISH[2], { visual: "move", pan: 0.3 }); add("s9-alert", S.flash + 0.02, CHIME, { visual: "appear", pan: 0.3 }); }
{ const S = T.s10; word("s10-head", S.head + 0.2); add("s10-right", S.right + 0.2, pick(TAP, 1), { visual: "land", pan: 0.4 }); add("s10-score-build", S.scoreEnd, RISER_HERO, { weight: "support", pan: 0.4 }); add("s10-verdict", S.verdict + 0.05, CHIME, { visual: "appear", pan: 0.4 }); add("s10-cursor", S.verdict + 0.3, SWISH[0], { visual: "move", pan: 0.4 }); hero("dispatch", S.click + 0.17, 0.4, "move"); add("s10-way", S.way + 0.1, CHIME_SOFT, { visual: "appear", pan: -0.4 }); }
{ const S = T.s11; add("s11-iris", S.start + 0.25, TRANSITION, { visual: "cut" }); for (let i = 0; i < 6; i += 2) add("s11-blip", S.blips + i * 0.2 + 0.05, pick(TICK, i), { visual: "appear", pan: 0.3 }); word("s11-head", S.head + 0.3, -0.3); add("s11-card", S.card + 0.3, pick(POP, 0), { visual: "appear", pan: -0.3 }); }
{ const S = T.s12; word("s12-head", S.head, -0.3); add("s12-card", S.card + 0.35, pick(TAP, 2), { visual: "land", pan: 0.3 }); for (let i = 0; i < 6; i++) add("s12-key", S.typeStart + 0.1 + i * ((S.typeEnd - S.typeStart - 0.2) / 5), pick(KEY, i), { visual: "appear", pan: 0.3 }); add("s12-guard", S.guard + 0.05, CHIME, { visual: "appear", pan: 0.3 }); }
{ const S = T.s13; S.w.forEach((t, i) => add("s13-word", t + 0.06, i % 2 ? pick(TAP, i) : pick(SWISH, i), { visual: "appear", pan: i % 2 ? 0.3 : -0.3 })); }
{ const S = T.s14; cut("s14", S.start); for (let i = 0; i < 6; i += 2) add("s14-shot", S.fly + i * 0.06 + 0.3, pick(TAP, i), { visual: "land", pan: -0.4 + i * 0.15 }); word("s14-title", S.title); add("s14-glow", S.title + 0.2, SHIMMER, { visual: "appear" }); }
{ const S = T.s15; cut("s15", S.start); add("s15-line", S.line + 0.3, SWISH[2], { visual: "move" }); add("s15-res", S.res + 0.05, pick(POP, 0), { visual: "appear" }); hero("outro", S.logo + 0.08, 0, "appear"); add("s15-pill", S.pill + 0.05, pick(POP, 2), { visual: "appear" }); }

cues.sort((a, b) => a.t - b.t);
let last = -1; const kept = [];
for (const c of cues) { if (c.weight !== "hero" && c.t - last < 0.3) continue; kept.push(c); last = c.t; }
const sheet = { fps: T.fps, duration_s: T.duration, energy: "punchy", lufs: -14, kit: "audio/kit", room: { decay_s: 0.5, wet_db: -18 }, music: { file: "audio/music.wav", start_s: 0, loop: false, fade_out_s: 1.4 }, duck_db: 10, cues: kept };
writeFileSync(new URL("../audio/cues.json", import.meta.url), JSON.stringify(sheet, null, 2));
console.log(`${kept.length} cues (of ${cues.length}) → audio/cues.json`);
