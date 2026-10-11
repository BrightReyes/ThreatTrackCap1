// ThreatTrack promo — the single source of truth for every beat (seconds).
// index.html reads window.TL; tools/cues.mjs reads the same file to build audio/cues.json.
// Picture and sound share these numbers; retime here, never in components.
const TL = {
  fps: 30,
  duration: 63,
  // Film current: LEFT. Reserved vectors: Z pull = arrival, Z push = deeper, UP = elevation.
  s1: { // Opening — phone floats in, headline waterfall
    start: 0, phoneIn: 0.15, phoneLand: 1.05, headline: 0.9, caption: 1.6, exit: 4.55, end: 5.1
  },
  s2: { // Logo hero — inverse-zoom arrival (Z pull)
    start: 4.55, logoLand: 5.35, wordmark: 5.75, tagline: 6.55, hold: 7.1, exit: 8.3, end: 8.9
  },
  s3: { // SOS gateway — 3 s hold, release, live GPS
    start: 8.3, phoneLand: 9.0, pressDown: 9.6, holdEnd: 12.6, release: 12.7, dispatched: 13.05,
    ping1: 13.5, ping2: 14.1, ping3: 14.7, callout1: 9.9, callout2: 12.9, callout3: 14.2,
    exit: 15.7, end: 16.3
  },
  s4: { // Report flow — category, role, details, then status tracking
    start: 15.7, phoneLand: 16.35, chip: 16.9, step2: 17.9, role: 18.35, step3: 19.1,
    typeStart: 19.25, typeEnd: 20.6, photo: 20.75, submit: 21.3, flip: 21.6,
    status1: 22.0, status2: 22.9, status3: 23.7, exit: 24.5, end: 25.1
  },
  s5: { // Typographic beat — "Reporting is easy." / "Response is what matters."
    start: 24.5, line1: 24.9, iconsIn: 25.1, zoom: 27.0, line2: 27.25, hold: 28.0, exit: 29.4, end: 30.0
  },
  s6: { // Admin command center — inverse-zoom arrival, stats tick, live row
    start: 29.4, windowLand: 30.2, stats: 30.5, statsEnd: 31.7, map: 31.0, heat: 31.6,
    rowIn: 32.9, rowLand: 33.25, flash: 33.3, exit: 36.1, end: 36.7
  },
  s7: { // Triage & dispatch — rack-focus into the incident modal
    start: 36.1, focus: 36.4, legit: 36.9, legitEnd: 38.0, chips: 38.2, precinct: 38.7,
    cursorIn: 39.0, click: 39.8, sent: 40.3, phoneIn: 40.7, phoneLand: 41.3, exit: 43.6, end: 44.2
  },
  s8: { // Analytics & AI decision support
    start: 43.6, panelLand: 44.3, bars: 44.5, line: 44.9, hotspots: 45.4, aiClick: 46.3,
    aiTypeStart: 46.7, aiTypeEnd: 49.4, guard: 49.6, exit: 51.2, end: 51.8
  },
  s9: { // Routing & roles diagram
    start: 51.2, title: 51.5, tiers: 51.9, routeHigh: 53.2, routeLow: 53.8, badge: 54.6, exit: 56.0, end: 56.6
  },
  s10: { // Speed streak → system architecture flow
    start: 56.0, streak: 56.0, streakEnd: 56.5, nodes: 56.6, links: 57.3, exit: 59.6, end: 60.2
  },
  s11: { // Outro — logo arrival, tagline, hold
    start: 59.6, logoLand: 60.3, wordmark: 60.6, tagline: 61.2, hold: 61.8, end: 63
  }
};
if (typeof window !== "undefined") window.TL = TL;
