// ThreatTrack promo v5 — Apple-style kinetic type on black + exploded UI collages, with ThreatTrack's own
// radar / case HUD / dispatch ticker. Every beat in seconds; anim.js and tools/cues.mjs read this file.
const TL = {
  fps: 30,
  duration: 72.0,
  s1:  { start: 0,    radar: 0.1,  b1: 0.2, b1End: 1.4, b2: 1.6, b2End: 3.0, end: 3.2 },                  // mystery hook: "Imagine a safer city."
  s2:  { start: 3.2,  w1: 3.25, w2: 3.55, end: 5.4 },                                                    // "Something happens."
  s3:  { start: 5.4,  w1: 5.45, w2: 5.9,  w3: 6.2, end: 8.0 },                                           // "Help should already be moving."
  s4:  { start: 8.0,  fly: 8.05, settle: 9.0, drift: 9.0, zoom: 10.6, end: 11.4 },                       // collage of screens
  s5:  { start: 11.4, a: 11.45, b: 12.1, c: 12.75, end: 13.6 },                                          // Report. Track. Respond.
  s6:  { start: 13.6, head: 13.65, card: 14.0, press: 14.7, holdEnd: 17.2, release: 17.3, sent: 17.65, row1: 18.0, row2: 18.3, row3: 18.6, end: 19.9 }, // Hold.
  s7:  { start: 19.9, head: 19.95, phone: 20.2, chip: 21.0, role: 21.6, photo: 22.2, submit: 22.8, sent: 23.15, end: 24.5 },  // Report in three taps.
  s8:  { start: 24.5, head: 24.55, card: 24.85, p1: 25.4, p2: 25.9, p3: 26.4, p4: 26.9, p5: 27.4, end: 28.6 },               // Track every step.
  s9:  { start: 28.6, head: 28.65, card: 28.95, stats: 29.3, rows: 29.6, newRow: 31.0, flash: 31.4, end: 32.9 },             // Live queue.
  s10: { start: 32.9, head: 32.95, click1: 33.55, uplink: 34.5, aiStart: 35.0, chk1: 35.3, chk2: 36.0, chk3: 36.7, hqClick: 38.0, relay: 38.5, subDeploy: 39.9, returnLoop: 40.5, way: 41.45, end: 44.4 }, // One click (11.5s duration)
  s11: { start: 44.4, head: 44.45, radar: 44.7, blips: 45.2, card: 46.6, end: 48.6 },                     // See it coming.
  s12: { start: 48.6, head: 48.65, card: 49.0, clickGen: 50.10, loadStart: 50.20, loadEnd: 52.20, typeStart: 52.40, guard: 53.6, approve: 54.60, end: 57.0 }, // RAG-powered (8.4s duration)
  s13: { start: 57.0, w: [57.10, 57.75, 58.40, 59.05, 59.70, 60.35], end: 61.2 },                         // role storm (relaxed beat)
  s14: { start: 61.2, fly: 61.25, settle: 62.1, title: 62.6, end: 65.4 },                                 // collage returns + line
  s15: { start: 65.4, line: 65.5, res: 66.3, logo: 66.9, word: 67.4, tag: 68.0, pill: 68.6, end: 72.0 }     // flatline → resolved → logo
};
if (typeof window !== "undefined") window.TL = TL;
