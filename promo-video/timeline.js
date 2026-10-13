// ThreatTrack promo v2 — every beat in seconds. Picture (anim.js) and sound (tools/cues.mjs) read this file.
// Structure borrowed from the two references: hard block wipes between full-bleed colour sections,
// one headline + one card per screen, a typographic beat on a solid block, glow logo in and out.
const TL = {
  fps: 30,
  duration: 62,
  wipe: 0.45, // block wipe duration at every cut
  s1:  { start: 0,    line: 0.2,  pulse: 1.0,  logo: 1.7,  word: 2.3,  tag: 3.0,  end: 4.6 },   // navy intro
  s2:  { start: 4.6,  l1: 4.9,   l2: 6.0,   l3: 7.0,   tick: 4.9,  end: 10.2 },               // red typographic beat
  s3:  { start: 10.2, card: 10.5, head: 10.8, press: 11.6, holdEnd: 14.6, release: 14.7, sent: 15.1, row1: 15.5, row2: 15.9, row3: 16.3, end: 17.6 }, // navy · SOS
  s4:  { start: 17.6, phone: 17.8, head: 18.1, chip: 18.9, role: 19.7, photo: 20.5, submit: 21.2, sent: 21.6, end: 23.4 },   // white · report
  s5:  { start: 23.4, card: 23.7, head: 24.0, p1: 24.6, p2: 25.3, p3: 26.0, p4: 26.7, p5: 27.4, end: 29.2 },                  // sky · status
  s6:  { start: 29.2, card: 29.5, head: 29.8, stats: 30.2, rows: 30.6, newRow: 32.4, flash: 32.8, end: 35.0 },               // navy · command center
  s7:  { start: 35.0, title: 35.3, left: 35.6, right: 35.9, score: 36.6, scoreEnd: 37.6, verdict: 37.7, click: 38.6, way: 39.2, eta: 39.7, end: 41.2 }, // split · citizen vs dispatcher
  s8:  { start: 41.2, title: 41.5, tiles: 41.7, tilesEnd: 43.2, card: 43.4, r1: 43.8, r2: 44.2, r3: 44.6, head: 45.2, end: 47.4 },   // navy · hotspot grid
  s9:  { start: 47.4, card: 47.7, head: 48.0, typeStart: 48.5, typeEnd: 51.2, guard: 51.5, end: 53.2 },                       // amber · AI
  s10: { start: 53.2, title: 53.5, chips: 53.9, chipsEnd: 55.6, end: 57.0 },                                                   // navy · every role
  s11: { start: 57.0, glow: 57.2, line: 57.6, word: 58.2, tag: 58.9, pill: 59.6, end: 62 }                                     // navy · outro
};
if (typeof window !== "undefined") window.TL = TL;
