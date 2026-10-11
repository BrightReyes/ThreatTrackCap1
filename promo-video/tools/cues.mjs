// Builds audio/cues.json for opus-sound-layer from timeline.js — the same numbers the picture uses.
// Also trims the music bed so a strong downbeat lands on the logo arrival (hero #1).
// Usage: node tools/cues.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";

const src = readFileSync(new URL("../timeline.js", import.meta.url), "utf8");
const T = new Function(src.replace(/if \(typeof window[^\n]*\n/, "") + "; return TL;")();
const fps = T.fps;

// ---- music: align a strong beat with the first hero (logo lands) ----
const HERO1 = T.s2.start + 0.58; // qa.py: the retraction fully stops ~17 frames after the cut // expo.out retraction is visually still ~0.48 s after the cut
let trim = 0;
const beatsPath = new URL("../beats/audio/music.wav.json", import.meta.url);
if (existsSync(beatsPath)) {
  const beats = JSON.parse(readFileSync(beatsPath, "utf8")).beats;
  // candidate downbeats: strong, and at least HERO1 seconds into the file so the trim stays >= 0
  const cands = beats.filter((b) => b.strength > 0.75 && b.time >= HERO1 + 0.5 && b.time < HERO1 + 6);
  if (cands.length) {
    const pick = cands.sort((a, b) => b.strength - a.strength)[0];
    trim = +(pick.time - HERO1).toFixed(3);
  }
}
execFileSync("ffmpeg", ["-v", "error", "-y", "-ss", String(trim), "-i", "audio/music-candidates/confident-session.mp3", "-t", String(T.duration + 4), "-ac", "2", "-ar", "48000", "audio/music.wav"]);
console.log(`music trimmed by ${trim}s so a downbeat lands at ${HERO1}s`);

// ---- cue sheet ----
// Sonic family: wood + air + glass. Heroes are "thump+tap" (soft film), each with a reverse build peaking on the land.
const THUMP = "thump/fs-133282-thump-on-carpet-2"; // sub-heavy: its main band sits under the music
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
  add(id, t, `${THUMP}+${TAPH}`, { weight: "hero", visual, pan, stop_before: true, build: true });
  add(id + "-build", t, RISER_HERO, { weight: "support" });
};
const seamLeft = (id, cut) => add(id, cut - 0.1, pick(WHOOSH, n), { visual: "move", pan: -0.3 });
const seamZ = (id, cut) => add(id, cut - 0.05, TRANSITION, { visual: "cut" });

// S1 — opening
{ const S = T.s1;
  add("s1-phone-in", S.phoneIn + 0.08, WHOOSH[0], { visual: "move", pan: 0.35 });
  add("s1-phone-land", S.phoneLand, pick(TAP, 0), { visual: "land", pan: 0.35 });
  add("s1-headline", S.headline, SWISH[0], { visual: "appear", pan: -0.3 });
  [0, 1, 2].forEach((i) => add("s1-pin", S.phoneLand + 0.05 + i * 0.07, pick(TAP, i + 1), { visual: "appear", pan: 0.35 }));
  seamZ("s1-exit", T.s2.start);
}
// S2 — logo hero
{ const S = T.s2;
  hero("logo", HERO1);
  add("s2-wordmark", S.wordmark, SWISH[1], { visual: "appear" });
  add("s2-wordmark-2", S.wordmark + 0.09, pick(TAP, 2), { visual: "land", pan: 0.2 });
  add("s2-tagline", S.tagline, pick(POP, 0), { visual: "appear" });
  seamZ("s2-exit", T.s3.start);
}
// S3 — SOS
{ const S = T.s3;
  add("s3-touch-in", S.pressDown - 0.45, SWISH[2], { visual: "move", pan: -0.2 });
  add("s3-press", S.pressDown, CLICK, { visual: "land", pan: -0.2 });
  add("s3-hold", S.release, RISER_LONG, { weight: "support" });
  hero("sos-release", S.release + 0.04, -0.2, "move");
  add("s3-modal", S.dispatched + 0.05, WHOOSH[1], { visual: "move", pan: -0.2 });
  [S.ping1, S.ping2, S.ping3].forEach((t, i) => add("s3-ping", t, pick(TICK, i), { visual: "appear", pan: -0.2 }));
  add("s3-unit", S.ping2 + 0.02, CHIME_SOFT, { visual: "appear", pan: -0.2 });
  [S.callout1, S.callout2, S.callout3].forEach((t, i) => add("s3-callout", t + 0.05, pick(POP, i), { visual: "appear", pan: 0.3 }));
  seamLeft("s3-exit", T.s4.start);
}
// S4 — report flow
{ const S = T.s4;
  add("s4-chip", S.chip, CLICK, { visual: "land", pan: -0.2 });
  add("s4-c1", S.chip + 0.05, pick(POP, 0), { visual: "appear", pan: 0.3 });
  add("s4-step2", S.step2, SWISH[0], { visual: "move", pan: -0.2 });
  add("s4-role", S.role, CLICK, { visual: "land", pan: -0.2 });
  add("s4-c2", S.role + 0.05, pick(POP, 1), { visual: "appear", pan: 0.3 });
  add("s4-sev", S.role + 0.35, CLICK, { visual: "land", pan: -0.2 });
  add("s4-step3", S.step3, SWISH[1], { visual: "move", pan: -0.2 });
  add("s4-c3", S.step3 + 0.25, pick(POP, 2), { visual: "appear", pan: 0.3 });
  for (let i = 0; i < 4; i++) add("s4-key", S.typeStart + 0.05 + i * ((S.typeEnd - S.typeStart - 0.1) / 3), pick(KEY, i), { visual: "appear", pan: -0.2 });
  add("s4-photo", S.photo, pick(POP, 0), { visual: "appear", pan: -0.2 });
  add("s4-submit", S.submit, CLICK_HEAVY, { visual: "land", pan: -0.2 });
  add("s4-flip", S.flip + 0.05, WHOOSH[0], { visual: "move", pan: -0.2 });
  add("s4-c4", S.status1 + 0.05, pick(POP, 1), { visual: "appear", pan: 0.3 });
  add("s4-status2", S.status2 + 0.08, pick(TICK, 0), { visual: "appear", pan: -0.2 });
  add("s4-status3", S.status3 + 0.08, CHIME, { visual: "appear", pan: -0.2 });
  seamLeft("s4-exit", T.s5.start);
}
// S5 — type beat
{ const S = T.s5;
  add("s5-line1", S.line1, SWISH[0], { visual: "appear" });
  [0, 2, 4, 6].forEach((i) => add("s5-tag", S.iconsIn + i * 0.06 + 0.1, pick(TAP, i), { visual: "land", pan: i % 4 === 0 ? -0.4 : 0.4 }));
  add("s5-zoom", S.zoom - 0.05, WHOOSH[1], { visual: "move" });
  add("s5-line2", S.zoom + 0.12, pick(TAP, 1), { visual: "land" });
  seamZ("s5-exit", T.s6.start);
}
// S6 — command center hero
{ const S = T.s6;
  hero("dashboard", S.start + 0.3);
  [0, 1, 2, 3].forEach((i) => add("s6-stat", S.stats + 0.15 + i * 0.25, pick(TICK, i), { visual: "appear", pan: -0.1 + i * 0.1 }));
  [0, 1].forEach((i) => add("s6-pin", S.map + 0.1 + i * 0.14, pick(TAP, i), { visual: "appear", pan: -0.25 }));
  add("s6-heat", S.heat + 0.1, SHIMMER, { visual: "appear", pan: -0.25 });
  add("s6-row-in", S.rowIn + 0.08, SWISH[2], { visual: "move", pan: 0.3 });
  add("s6-row-land", S.rowLand, pick(POP, 2), { visual: "land", pan: 0.3 });
  add("s6-alert", S.flash + 0.02, CHIME, { visual: "appear", pan: 0.3 });
  add("s6-focus", T.s7.start - 0.12, TRANSITION, { visual: "cut" });
}
// S7 — triage & dispatch hero
{ const S = T.s7;
  add("s7-legit-build", S.legitEnd, RISER_HERO, { weight: "support", pan: -0.3 });
  add("s7-verdict", S.legitEnd, CHIME, { visual: "appear", pan: -0.3 });
  add("s7-ai", S.legitEnd + 0.12, pick(POP, 0), { visual: "appear", pan: -0.3 });
  [0, 2].forEach((i) => add("s7-pill", S.chips + i * 0.08 + 0.05, pick(TAP, i), { visual: "appear", pan: -0.3 }));
  add("s7-precinct", S.precinct, pick(TICK, 1), { visual: "appear", pan: 0.3 });
  add("s7-cursor", S.cursorIn + 0.1, SWISH[0], { visual: "move", pan: 0.3 });
  hero("dispatch", S.click + 0.04, 0.25, "move");
  add("s7-sent", S.sent + 0.05, CHIME_SOFT, { visual: "appear", pan: 0.3 });
  add("s7-phone-in", S.phoneIn + 0.08, WHOOSH[0], { visual: "move", pan: 0.45 });
  add("s7-phone-land", S.phoneLand, pick(TAP, 0), { visual: "land", pan: 0.45 });
  seamLeft("s7-exit", T.s8.start);
}
// S8 — analytics & AI
{ const S = T.s8;
  [0, 1, 2].forEach((i) => add("s8-kpi", S.panelLand + 0.3 + i * 0.25, pick(TICK, i), { visual: "appear", pan: -0.1 + i * 0.1 }));
  [0, 2].forEach((i) => add("s8-bar", S.bars + 0.1 + i * 0.12, pick(TAP, i), { visual: "appear", pan: -0.35 }));
  add("s8-line", S.line + 0.2, SWISH[1], { visual: "move", pan: -0.35 });
  [0, 2].forEach((i) => add("s8-hot", S.hotspots + 0.05 + i * 0.075, pick(POP, i), { visual: "appear", pan: 0 }));
  add("s8-gen", S.aiClick, CLICK_HEAVY, { visual: "land", pan: 0.35 });
  for (let i = 0; i < 5; i++) add("s8-stream", S.aiTypeStart + 0.1 + i * ((S.aiTypeEnd - S.aiTypeStart - 0.2) / 4), pick(KEY, i), { visual: "appear", pan: 0.35 });
  add("s8-guard", S.guard + 0.05, CHIME, { visual: "appear", pan: 0.35 });
  seamLeft("s8-exit", T.s9.start);
}
// S9 — routing diagram
{ const S = T.s9;
  add("s9-title", S.title, SWISH[0], { visual: "appear" });
  add("s9-n0", S.tiers + 0.05, pick(POP, 0), { visual: "appear", pan: -0.35 });
  [0, 1, 2].forEach((i) => add("s9-node", S.tiers + 0.3 + i * 0.17, pick(TAP, i), { visual: "appear", pan: 0.2 + i * 0.1 }));
  add("s9-route-high", S.routeHigh + 0.1, SWISH[1], { visual: "move", pan: 0 });
  add("s9-badge-high", S.routeHigh + 0.35, pick(POP, 1), { visual: "appear", pan: -0.1 });
  add("s9-route-low", S.routeLow + 0.1, SWISH[2], { visual: "move", pan: 0 });
  add("s9-badge-low", S.routeLow + 0.35, pick(POP, 2), { visual: "appear", pan: -0.1 });
  add("s9-hq", S.badge - 0.1, pick(TICK, 0), { visual: "move", pan: 0.4 });
  add("s9-exit", T.s10.start - 0.2, WHOOSH[1], { visual: "move", pan: -0.4 });
}
// S10 — streak → architecture
{ const S = T.s10;
  add("s10-streak", S.streak + 0.15, TRANSITION, { visual: "cut", pan: -0.2 });
  [0, 2, 4].forEach((i) => add("s10-node", S.nodes + 0.05 + i * 0.1, pick(TAP, i), { visual: "appear", pan: -0.4 + i * 0.2 }));
  [0, 2].forEach((i) => add("s10-link", S.links + 0.2 + i * 0.12, pick(TICK, i), { visual: "move", pan: -0.2 + i * 0.13 }));
  seamZ("s10-exit", T.s11.start);
}
// S11 — outro hero
{ const S = T.s11;
  hero("outro", S.start + 0.63);
  add("s11-wordmark", S.wordmark, SWISH[1], { visual: "appear" });
  add("s11-wordmark-2", S.wordmark + 0.09, pick(TAP, 2), { visual: "land", pan: 0.2 });
  add("s11-tagline", S.tagline, pick(POP, 0), { visual: "appear" });
}

const sheet = {
  fps,
  duration_s: T.duration,
  energy: "punchy",
  lufs: -14,
  kit: "audio/kit",
  room: { decay_s: 0.5, wet_db: -18 },
  music: { file: "audio/music.wav", start_s: 0, loop: false, fade_out_s: 1.2 },
  duck_db: 10,
  cues
};
// decluster: mix.py drops any support cue within 0.15 s of the previous one by 4.4 dB, which qa.py then flags as inaudible
cues.sort((a, b) => a.t - b.t);
let last = -1, kept = [];
for (const c of cues) {
  if (c.weight !== "hero" && c.t - last < 0.16) continue;
  kept.push(c); last = c.t;
}
sheet.cues = kept;
writeFileSync(new URL("../audio/cues.json", import.meta.url), JSON.stringify(sheet, null, 2));
console.log(`${kept.length} cues (of ${cues.length}) → audio/cues.json`);
