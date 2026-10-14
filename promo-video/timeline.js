// ThreatTrack promo v5 — Apple-style kinetic type on black + exploded UI collages, with ThreatTrack's own
// radar / case HUD / dispatch ticker. Every beat in seconds; anim.js and tools/cues.mjs read this file.
const TL = {
  fps: 30,
  duration: 62,
  s1:  { start: 0,    radar: 0.1,  logo: 1.5,  word: 1.9,  end: 3.2 },                                  // radar finds the mark
  s2:  { start: 3.2,  w1: 3.25, w2: 3.55, end: 5.4 },                                                    // "Something happens."
  s3:  { start: 5.4,  w1: 5.45, w2: 5.9,  w3: 6.2, end: 8.0 },                                           // "Help should already be moving."
  s4:  { start: 8.0,  fly: 8.05, settle: 9.0, drift: 9.0, zoom: 10.6, end: 11.4 },                       // collage of screens
  s5:  { start: 11.4, a: 11.45, b: 12.1, c: 12.75, end: 13.6 },                                          // Report. Track. Respond.
  s6:  { start: 13.6, head: 13.65, card: 14.0, press: 14.7, holdEnd: 17.2, release: 17.3, sent: 17.65, row1: 18.0, row2: 18.3, row3: 18.6, end: 19.9 }, // Hold.
  s7:  { start: 19.9, head: 19.95, phone: 20.2, chip: 21.0, role: 21.6, photo: 22.2, submit: 22.8, sent: 23.15, end: 24.5 },  // Report in three taps.
  s8:  { start: 24.5, head: 24.55, card: 24.85, p1: 25.4, p2: 25.9, p3: 26.4, p4: 26.9, p5: 27.4, end: 28.6 },               // Track every step.
  s9:  { start: 28.6, head: 28.65, card: 28.95, stats: 29.3, rows: 29.6, newRow: 31.0, flash: 31.4, end: 32.9 },             // Live queue.
  s10: { start: 32.9, head: 32.95, left: 33.3, right: 33.5, score: 34.1, scoreEnd: 35.0, verdict: 35.1, click: 35.9, way: 36.5, eta: 36.9, end: 38.4 }, // One click.
  s11: { start: 38.4, head: 38.45, radar: 38.7, blips: 39.2, card: 40.6, end: 42.6 },                     // See it coming.
  s12: { start: 42.6, head: 42.65, card: 43.0, typeStart: 43.5, typeEnd: 46.2, guard: 46.4, end: 47.6 }, // AI drafts. Officers decide.
  s13: { start: 47.6, w: [47.65, 48.15, 48.65, 49.15, 49.65, 50.15], end: 51.2 },                         // role storm
  s14: { start: 51.2, fly: 51.25, settle: 52.1, title: 52.6, end: 55.4 },                                 // collage returns + line
  s15: { start: 55.4, line: 55.5, res: 56.3, logo: 56.9, word: 57.4, tag: 58.0, pill: 58.6, end: 62 }     // flatline → resolved → logo
};
if (typeof window !== "undefined") window.TL = TL;
