/* ThreatTrack promo — all motion. Every start time comes from window.TL (timeline.js).
   Film current = LEFT (cut-the-curve). Z pull = arrival (logo, command center, outro).
   Z push = going deeper (logo → SOS, "easy" → "matters"). Rack-focus once (queue → modal). */
(function () {
  const T = window.TL;
  const tl = gsap.timeline({ paused: true });
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ---------- helpers ----------
  // Waterfall entry (cut-the-curve §6): binary opacity, y from below, gaps shrink, anchors travel further.
  function waterfall(sel, t0, opts = {}) {
    const items = typeof sel === "string" ? $$(sel) : sel;
    const gap0 = opts.gap ?? 0.07, decay = opts.decay ?? 0.84, dy = opts.dy ?? 64, dur = opts.dur ?? 0.2;
    let t = t0, gap = gap0;
    items.forEach((el, i) => {
      const heavy = i === 0 || i === items.length - 1;
      tl.set(el, { opacity: 1 }, t);
      tl.fromTo(el, { y: heavy ? dy * 1.2 : dy, rotate: opts.rot ?? 0 }, { y: 0, rotate: 0, duration: heavy ? dur : dur * 0.8, ease: "power4.out" }, t);
      t += gap; gap *= decay;
    });
    return t;
  }
  function hideWords(sel) { $$(sel).forEach((w) => gsap.set(w, { opacity: 0 })); }
  // Simple arrive-from-below for blocks (power4.out), opacity binary via set.
  function arrive(el, t, dy = 40, dur = 0.45) {
    tl.set(el, { opacity: 1 }, t);
    tl.fromTo(el, { y: dy }, { y: 0, duration: dur, ease: "power4.out" }, t);
  }
  function fadeIn(el, t, dur = 0.35, dy = 14) {
    tl.fromTo(el, { opacity: 0, y: dy }, { opacity: 1, y: 0, duration: dur, ease: "power3.out" }, t);
  }
  function fadeOut(el, t, dur = 0.25, dy = -10) {
    tl.to(el, { opacity: 0, y: dy, duration: dur, ease: "power2.in" }, t);
  }
  function pop(el, t, s = 1.06, dur = 0.32) {
    tl.fromTo(el, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: dur, ease: "back.out(1.6)" }, t);
  }
  // Counter — a pure function of time, so it survives seeks.
  function count(el, t, to, dur = 1.1, fmt = (n) => Math.round(n).toLocaleString("en-US")) {
    if (typeof el === "string") el = $(el);
    const o = { n: 0 };
    tl.to(o, { n: to, duration: dur, ease: "power2.out", onUpdate: () => { el.textContent = fmt(o.n); } }, t);
  }
  // Typing — same technique.
  function type(el, t, text, cps = 34, caret, ph) {
    if (typeof el === "string") el = $(el);
    const o = { n: 0 };
    const dur = text.length / cps;
    if (ph) tl.to(ph, { opacity: 0, duration: 0.15 }, t);
    tl.to(o, { n: text.length, duration: dur, ease: "none", onUpdate: () => { el.textContent = text.slice(0, Math.round(o.n)); } }, t);
    if (caret) {
      tl.set(caret, { opacity: 1 }, t);
      tl.to(caret, { opacity: 0, duration: 0.42, repeat: Math.ceil(dur / 0.42) + 3, yoyo: true, ease: "steps(1)" }, t + dur);
    }
    return t + dur;
  }
  // Press: anticipation (down) → release (overshoot) → settle. Squash keeps volume.
  function press(el, t, down = 0.1) {
    tl.to(el, { scaleX: 1.03, scaleY: 0.93, duration: down, ease: "power2.in" }, t);
    tl.to(el, { scaleX: 1, scaleY: 1, duration: 0.42, ease: "back.out(2.2)" }, t + down);
  }

  // ---------- seams ----------
  const CTC = 0.34;             // cut-the-curve travel time per side
  const ZX = 0.2, ZE = 0.5;     // zoom-through exit / entry
  // Cut the curve, leftward: outgoing stage accelerates left and dies at the cut; incoming continues left.
  function ctcExit(stage, cut) {
    tl.to(stage, { x: -230, duration: CTC, ease: "power4.in" }, cut - CTC);
    tl.to(stage, { opacity: 0, duration: 0.2, ease: "none" }, cut - CTC);
  }
  function ctcEntry(stage, cut) {
    tl.fromTo(stage, { x: 230, opacity: 0.35 }, { x: 0, opacity: 1, duration: CTC, ease: "power4.out" }, cut);
  }
  // Z pull (arrival): outgoing recedes, incoming arrives oversized and retracts. Same sign both sides.
  function pullExit(stage, cut, blur = 10) {
    tl.to(stage, { scale: 0.8, filter: `blur(${blur}px)`, duration: ZX, ease: "power3.in" }, cut - ZX);
    tl.to(stage, { opacity: 0.15, duration: ZX, ease: "none" }, cut - ZX);
  }
  function pullEntry(stage, cut, blur = 10) {
    tl.fromTo(stage, { scale: 1.25, filter: `blur(${blur}px)`, opacity: 0.15 }, { scale: 1, filter: "blur(0px)", opacity: 1, duration: ZE, ease: "expo.out" }, cut);
  }
  // Z push (deeper): everything grows.
  function pushExit(stage, cut, blur = 10) {
    tl.to(stage, { scale: 1.2, filter: `blur(${blur}px)`, duration: ZX, ease: "power3.in" }, cut - ZX);
    tl.to(stage, { opacity: 0.15, duration: ZX, ease: "none" }, cut - ZX);
  }
  function pushEntry(stage, cut, blur = 10) {
    tl.fromTo(stage, { scale: 0.75, filter: `blur(${blur}px)`, opacity: 0.15 }, { scale: 1, filter: "blur(0px)", opacity: 1, duration: ZE, ease: "expo.out" }, cut);
  }

  // Captions: slide up on their own data-start, out before their window closes.
  $$(".caption").forEach((c) => {
    const s = parseFloat(c.dataset.start), d = parseFloat(c.dataset.duration);
    tl.fromTo(c.firstElementChild, { opacity: 0, y: 22 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, s);
    tl.to(c.firstElementChild, { opacity: 0, y: -8, duration: 0.25, ease: "power2.in" }, s + d - 0.3);
  });

  // ============ S1 · Opening ============
  {
    const S = T.s1, stage = "#s1 .stage";
    hideWords("#s1 .w");
    tl.set("#s1-persp", { transformPerspective: 2200 }, 0);
    // phone floats in from the right, lands on a held tilt (not a wobble)
    tl.fromTo("#s1-phone", { x: 420, y: 80, rotateY: -22, rotateX: 8, opacity: 0 },
      { x: 0, y: 0, rotateY: -11, rotateX: 5, opacity: 1, duration: S.phoneLand - S.phoneIn, ease: "power4.out" }, S.phoneIn);
    // secondary action: pins and heat land after the phone settles, each on its own beat
    $$("#s1 .pin").forEach((p, i) => tl.fromTo(p, { y: -26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.7)" }, S.phoneLand - 0.1 + i * 0.07));
    $$("#s1 .heat").forEach((h, i) => tl.fromTo(h, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "power3.out" }, S.phoneLand + 0.25 + i * 0.12));
    fadeIn("#s1 .s1-eb", 0.55);
    waterfall("#s1 .w", S.headline, { dy: 80, dur: 0.22, gap: 0.085 });
    fadeIn("#s1 .s1-sub", S.headline + 0.75, 0.45, 18);
    pullExit(stage, T.s2.start);
  }

  // ============ S2 · Logo hero (Z arrival) ============
  {
    const S = T.s2, stage = "#s2 .stage";
    hideWords("#s2 .w");
    pullEntry(stage, S.start);
    // the mark lands first and takes the hit; a tiny settle keeps its weight
    tl.fromTo("#s2-mark", { scale: 1.08 }, { scale: 1, duration: 0.5, ease: "power3.out" }, S.logoLand);
    waterfall("#s2-word .w", S.wordmark, { dy: 90, dur: 0.24, gap: 0.09 });
    waterfall("#s2-tag .w", S.tagline, { dy: 40, dur: 0.16, gap: 0.08 });
    pushExit(stage, T.s3.start);
  }

  // ============ S3 · SOS gateway ============
  {
    const S = T.s3, stage = "#s3 .stage";
    pushEntry(stage, S.start);
    tl.set("#s3-persp", { transformPerspective: 2200 }, 0);
    tl.set("#s3-phone", { rotateY: -9, rotateX: 4 }, 0);
    tl.set("#s3-em", { y: 820, opacity: 1 }, 0);
    tl.set("#s3-touch", { opacity: 0, scale: 1.3 }, 0);
    $$("#s3 .callout").forEach((c) => tl.set(c, { opacity: 0 }, 0));
    // touch arrives on an arc (x and y on different eases), then presses
    tl.fromTo("#s3-touch", { x: 220, y: 240, opacity: 0, scale: 1.3 }, { x: 0, opacity: 0.9, duration: 0.5, ease: "power2.out" }, S.pressDown - 0.5);
    tl.fromTo("#s3-touch", { y: 240 }, { y: 0, duration: 0.5, ease: "power4.out" }, S.pressDown - 0.5);
    tl.to("#s3-touch", { scale: 0.86, duration: 0.12, ease: "power2.in" }, S.pressDown);
    tl.to("#s3-btn", { scaleX: 1.04, scaleY: 0.94, duration: 0.12, ease: "power2.in" }, S.pressDown);
    // the hold: halo and fill grow for three seconds — the UI performs, nothing idles
    tl.fromTo("#s3-halo", { scale: 1, opacity: 0.26 }, { scale: 1.34, opacity: 0.02, duration: S.holdEnd - S.pressDown, ease: "power1.out" }, S.pressDown);
    tl.fromTo("#s3-fill", { scale: 0.72 }, { scale: 1, duration: S.holdEnd - S.pressDown, ease: "power1.inOut" }, S.pressDown);
    tl.to("#s3-status", { backgroundColor: "#fef2f2", borderColor: "#fecaca", color: "#dc2626", duration: 0.2 }, S.pressDown);
    tl.to("#s3-status i", { backgroundColor: "#dc2626", duration: 0.2 }, S.pressDown);
    tl.set("#s3-status-t", { textContent: "Keep holding to continue" }, S.pressDown + 0.1);
    // anticipation then release: button snaps back with overshoot, touch lifts away
    tl.to("#s3-btn", { scaleX: 1.06, scaleY: 0.9, duration: 0.1, ease: "power2.in" }, S.holdEnd);
    tl.to("#s3-btn", { scaleX: 1, scaleY: 1, duration: 0.45, ease: "back.out(2.4)" }, S.release);
    tl.to("#s3-touch", { scale: 1.25, opacity: 0, duration: 0.25, ease: "power2.out" }, S.release);
    tl.to("#s3-halo", { scale: 1.9, opacity: 0, duration: 0.35, ease: "power3.out" }, S.release);
    // stillness, then the tracking screen rises over the gateway
    tl.to("#s3-gate", { y: -60, opacity: 0, filter: "blur(6px)", duration: 0.45, ease: "power3.inOut" }, S.dispatched);
    tl.to("#s3-em", { y: 0, duration: 0.55, ease: "power4.out" }, S.dispatched);
    [S.ping1, S.ping2, S.ping3].forEach((t, i) => {
      tl.set("#s3-pings", { textContent: String(i + 1) }, t);
      tl.fromTo("#s3-pings", { scale: 1.5, color: "#fca5a5" }, { scale: 1, color: "#ffffff", duration: 0.35, ease: "power3.out" }, t);
    });
    tl.to("#s3-st2", { color: "#dc2626", duration: 0.2 }, S.ping1);
    tl.to("#s3-st2 i", { backgroundColor: "#dc2626", duration: 0.2 }, S.ping1);
    tl.to("#s3-st3", { color: "#dc2626", duration: 0.2 }, S.ping2);
    tl.to("#s3-st3 i", { backgroundColor: "#dc2626", duration: 0.2 }, S.ping2);
    tl.fromTo("#s3-unit", { boxShadow: "0 0 0 0 rgba(220,38,38,0)" }, { boxShadow: "0 0 0 6px rgba(220,38,38,0.18)", duration: 0.35, ease: "power2.out" }, S.ping2);
    tl.to("#s3-unit", { boxShadow: "0 0 0 0 rgba(220,38,38,0)", duration: 0.6, ease: "power2.out" }, S.ping2 + 0.5);
    [["#s3-c1", S.callout1], ["#s3-c2", S.callout2], ["#s3-c3", S.callout3]].forEach(([id, t]) => { arrive(id, t, 46, 0.42); pop(id + " .dot", t + 0.05); });
    ctcExit(stage, T.s4.start);
  }

  // ============ S4 · Report flow ============
  {
    const S = T.s4, stage = "#s4 .stage";
    ctcEntry(stage, S.start);
    tl.set("#s4-persp", { transformPerspective: 2200 }, 0);
    tl.set("#s4-phone", { rotateY: -9, rotateX: 4 }, 0);
    tl.set(["#s4-b2", "#s4-b3"], { x: 60, opacity: 0 }, 0);
    tl.set("#s4-status", { y: 820 }, 0);
    tl.set(["#s4-p2", "#s4-p3"], { opacity: 0, scale: 0.7, position: "absolute", right: 14 }, 0);
    tl.set("#s4-photo", { opacity: 0, scale: 0.6 }, 0);
    tl.set("#s4-caret", { opacity: 0 }, 0);
    $$("#s4 .callout").forEach((c) => tl.set(c, { opacity: 0 }, 0));
    // step 1 — category
    tl.to("#s4-cat", { backgroundColor: "#fff1f2", borderColor: "#dc2626", duration: 0.18 }, S.chip);
    tl.to("#s4-cat b", { color: "#dc2626", duration: 0.18 }, S.chip);
    press("#s4-cat", S.chip, 0.08);
    arrive("#s4-c1t", S.chip, 40); pop("#s4-c1t .dot", S.chip + 0.05);
    // step 2 — role + severity
    tl.to("#s4-b1", { x: -60, opacity: 0, duration: 0.25, ease: "power3.in" }, S.step2 - 0.25);
    tl.to("#s4-b2", { x: 0, opacity: 1, duration: 0.35, ease: "power4.out" }, S.step2);
    tl.to("#s4-c1", { backgroundColor: "#0f172a", borderColor: "#0f172a", color: "#fff", duration: 0.2 }, S.step2);
    tl.to("#s4-c2", { backgroundColor: "#dc2626", borderColor: "#dc2626", color: "#fff", duration: 0.2 }, S.step2);
    tl.set("#s4-stepname", { textContent: "Reporting Role" }, S.step2);
    tl.to("#s4-role", { backgroundColor: "#fff1f2", borderColor: "#dc2626", duration: 0.18 }, S.role);
    press("#s4-role", S.role, 0.08);
    tl.to("#s4-sev", { backgroundColor: "#fffbeb", borderColor: "#fde68a", color: "#b45309", duration: 0.18 }, S.role + 0.35);
    press("#s4-sev", S.role + 0.35, 0.08);
    arrive("#s4-c2t", S.role, 40); pop("#s4-c2t .dot", S.role + 0.05);
    // step 3 — details, photo, submit
    tl.to("#s4-b2", { x: -60, opacity: 0, duration: 0.25, ease: "power3.in" }, S.step3 - 0.25);
    tl.to("#s4-b3", { x: 0, opacity: 1, duration: 0.35, ease: "power4.out" }, S.step3);
    tl.to("#s4-c2", { backgroundColor: "#0f172a", borderColor: "#0f172a", duration: 0.2 }, S.step3);
    tl.to("#s4-c3", { backgroundColor: "#dc2626", borderColor: "#dc2626", color: "#fff", duration: 0.2 }, S.step3);
    tl.set("#s4-stepname", { textContent: "Details and Evidence" }, S.step3);
    tl.set("#s4-next", { textContent: "Submit Report" }, S.step3);
    type("#s4-typed", S.typeStart, "Bag snatched by a rider near the main road, heading toward the market.", 52, "#s4-caret", "#s4-ph");
    pop("#s4-photo", S.photo, 1, 0.4);
    arrive("#s4-c3t", S.step3 + 0.2, 40); pop("#s4-c3t .dot", S.step3 + 0.25);
    press("#s4-next", S.submit, 0.1);
    tl.to("#s4-report", { y: -50, opacity: 0, filter: "blur(6px)", duration: 0.45, ease: "power3.inOut" }, S.flip);
    tl.to("#s4-status", { y: 0, duration: 0.55, ease: "power4.out" }, S.flip);
    // status pills: each hands off to the next
    tl.to("#s4-p1", { scale: 0.7, opacity: 0, duration: 0.2, ease: "power2.in" }, S.status2);
    tl.to("#s4-p2", { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)" }, S.status2 + 0.08);
    tl.to("#s4-t2", { color: "#dc2626", duration: 0.2 }, S.status2);
    tl.to("#s4-t2 i", { backgroundColor: "#dc2626", duration: 0.2 }, S.status2);
    tl.to("#s4-p2", { scale: 0.7, opacity: 0, duration: 0.2, ease: "power2.in" }, S.status3);
    tl.to("#s4-p3", { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.8)" }, S.status3 + 0.08);
    arrive("#s4-c4t", S.status1, 40); pop("#s4-c4t .dot", S.status1 + 0.05);
    ctcExit(stage, T.s5.start);
  }

  // ============ S5 · Typographic beat ============
  {
    const S = T.s5, stage = "#s5 .stage";
    hideWords("#s5 .w");
    tl.set("#s5-l2", { opacity: 0 }, 0);
    ctcEntry(stage, S.start);
    waterfall("#s5-l1 .w", S.line1, { dy: 90, dur: 0.22, gap: 0.08 });
    // category tags fly in from the edges on their own arcs, then blast out when the line zooms through
    $$("#s5 .s5-i").forEach((el, i) => {
      const fromX = (i % 2 === 0 ? -1 : 1) * (320 + i * 40), fromY = (i < 4 ? -1 : 1) * 180;
      tl.fromTo(el, { x: fromX, y: fromY, opacity: 0, scale: 0.8 }, { x: 0, y: 0, opacity: 1, scale: 1, duration: 0.7, ease: "power4.out" }, S.iconsIn + i * 0.06);
      tl.to(el, { x: fromX * 2.2, y: fromY * 2.2, opacity: 0, scale: 1.3, duration: 0.45, ease: "power3.in" }, S.zoom - 0.15 + i * 0.02);
    });
    // zoom-through: line 1 pushes toward camera, line 2 arrives from behind
    tl.to("#s5-l1", { scale: 1.2, filter: "blur(10px)", duration: ZX, ease: "power3.in" }, S.zoom - ZX);
    tl.to("#s5-l1", { opacity: 0, duration: ZX, ease: "none" }, S.zoom - ZX);
    tl.set("#s5-l2 .w", { opacity: 1 }, S.zoom);
    tl.fromTo("#s5-l2", { scale: 0.75, filter: "blur(10px)", opacity: 0.15 }, { scale: 1, filter: "blur(0px)", opacity: 1, duration: ZE, ease: "expo.out" }, S.zoom);
    pullExit(stage, T.s6.start, 18);
  }

  // ============ S6 · Admin command center (Z arrival) ============
  {
    const S = T.s6, stage = "#s6 .stage";
    pullEntry(stage, S.start, 18);
    tl.set("#s6-newrow", { opacity: 0, y: -40 }, 0);
    tl.set("#s6-queue .row:not(#s6-newrow)", { y: -74 }, 0);
    tl.set(["#s6 .s6-heat", "#s6 .s6-pin"], { opacity: 0 }, 0);
    $$("#s6 .s6-num").forEach((el, i) => count(el, S.stats + i * 0.08, +el.dataset.to, S.statsEnd - S.stats));
    $$("#s6 .s6-pin").forEach((p, i) => tl.fromTo(p, { y: -24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4, ease: "back.out(1.7)" }, S.map + i * 0.07));
    $$("#s6 .s6-heat").forEach((h, i) => tl.fromTo(h, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power3.out" }, S.heat + i * 0.15));
    ["18:42:08", "18:42:09", "18:42:10", "18:42:11", "18:42:12", "18:42:13"].forEach((s, i) => tl.set("#s6-clock", { textContent: s }, S.windowLand + 0.3 + i));
    // a new report streams in: the queue makes room (nudge), the row lands, the panel flashes once
    tl.to("#s6-queue .row:not(#s6-newrow)", { y: 0, duration: 0.45, ease: "power3.inOut" }, S.rowIn);
    tl.to("#s6-newrow", { opacity: 1, y: 0, duration: S.rowLand - S.rowIn + 0.1, ease: "power4.out" }, S.rowIn + 0.05);
    tl.fromTo("#s6-flash", { opacity: 0 }, { opacity: 1, duration: 0.08, ease: "none" }, S.flash);
    tl.to("#s6-flash", { opacity: 0, duration: 0.7, ease: "power2.out" }, S.flash + 0.08);
    tl.set("#s6-req-n", { textContent: "6" }, S.flash);
    tl.fromTo("#s6-req", { scale: 1.12 }, { scale: 1, duration: 0.4, ease: "back.out(2)" }, S.flash);
    tl.fromTo("#s6-newrow .badge.high", { scale: 1.25 }, { scale: 1, duration: 0.4, ease: "back.out(2)" }, S.flash);
    // rack-focus out: the dashboard defocuses, the modal comes into focus on the same surface
    tl.to(stage, { filter: "blur(12px)", scale: 1.06, duration: 0.3, ease: "power2.in" }, T.s7.start - 0.3);
    tl.to(stage, { opacity: 0, duration: 0.02 }, T.s7.start - 0.02);
  }

  // ============ S7 · Triage & dispatch ============
  {
    const S = T.s7, stage = "#s7 .stage";
    tl.fromTo(stage, { filter: "blur(12px)", scale: 1.06, opacity: 1 }, { filter: "blur(0px)", scale: 1, duration: 0.45, ease: "power2.out" }, S.start);
    tl.set("#s7-persp", { transformPerspective: 2200 }, 0);
    tl.set("#s7-phone", { x: 520, rotateY: -14, rotateX: 4, opacity: 0 }, 0);
    tl.set(["#s7-sent", "#s7-ai"], { opacity: 0, scale: 0.8 }, 0);
    tl.set("#s7-pills .chip", { opacity: 0, y: 10 }, 0);
    tl.set("#s7-cursor", { opacity: 0 }, 0);
    // legitimacy: the score climbs, then the verdict lands with the colour
    tl.to("#s7-bar", { width: "87%", duration: S.legitEnd - S.legit, ease: "power2.inOut" }, S.legit);
    count($("#s7-score"), S.legit, 87, S.legitEnd - S.legit);
    tl.set("#s7-res", { textContent: "High Confidence Legit" }, S.legitEnd);
    tl.fromTo("#s7-res", { scale: 1.08 }, { scale: 1, duration: 0.35, ease: "back.out(2)" }, S.legitEnd);
    tl.to("#s7-legit", { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0", duration: 0.3 }, S.legitEnd);
    pop("#s7-ai", S.legitEnd + 0.1);
    $$("#s7-pills .chip").forEach((c, i) => tl.to(c, { opacity: 1, y: 0, duration: 0.3, ease: "power3.out" }, S.chips + i * 0.08));
    tl.fromTo("#s7-opts .opt.on", { backgroundColor: "#ffffff", borderColor: "#f1f5f9" }, { backgroundColor: "#fff1f2", borderColor: "#fecaca", duration: 0.3 }, S.precinct);
    tl.fromTo("#s7-eta", { scale: 1.15, color: "#dc2626" }, { scale: 1, color: "#334155", duration: 0.5, ease: "power3.out" }, S.precinct);
    // oversized cursor walks the eye to Dispatch, on an arc, and its click ignites the result
    tl.set("#s7-cursor", { opacity: 1 }, S.cursorIn);
    tl.fromTo("#s7-cursor", { x: 0 }, { x: -295, duration: S.click - S.cursorIn, ease: "power2.inOut" }, S.cursorIn);
    tl.fromTo("#s7-cursor", { y: 0 }, { y: -452, duration: S.click - S.cursorIn, ease: "power3.out" }, S.cursorIn);
    tl.to("#s7-cursor", { scale: 0.82, duration: 0.08, ease: "power2.in" }, S.click);
    tl.to("#s7-cursor", { scale: 1, duration: 0.3, ease: "back.out(2)" }, S.click + 0.08);
    press("#s7-dispatch", S.click, 0.08);
    tl.to("#s7-dispatch", { backgroundColor: "#991b1b", duration: 0.1 }, S.click);
    tl.to("#s7-dispatch", { backgroundColor: "#dc2626", duration: 0.3 }, S.click + 0.1);
    tl.set("#s7-dispatch", { textContent: "Dispatched" }, S.click + 0.2);
    tl.to("#s7-cursor", { x: -120, y: -300, opacity: 0, duration: 0.5, ease: "power2.in" }, S.sent);
    pop("#s7-sent", S.sent, 1, 0.45);
    // the citizen's phone answers from the right
    tl.to("#s7-phone", { x: 0, rotateY: -9, opacity: 1, duration: S.phoneLand - S.phoneIn, ease: "power4.out" }, S.phoneIn);
    tl.fromTo("#s7-help", { scale: 0.96 }, { scale: 1, duration: 0.5, ease: "back.out(1.8)" }, S.phoneLand);
    ctcExit(stage, T.s8.start);
  }

  // ============ S8 · Analytics & AI ============
  {
    const S = T.s8, stage = "#s8 .stage";
    ctcEntry(stage, S.start);
    tl.set("#s8-bars rect", { scaleY: 0, transformOrigin: "50% 100%" }, 0);
    tl.set("#s8-line", { strokeDasharray: 1400, strokeDashoffset: 1400 }, 0);
    tl.set("#s8-hot .h", { opacity: 0 }, 0);
    tl.set("#s8-guard span", { opacity: 0, scale: 0.7 }, 0);
    tl.set("#s8-caret", { opacity: 0 }, 0);
    $$("#s8 .s8-num").forEach((el, i) => count(el, S.panelLand + 0.2 + i * 0.08, +el.dataset.to, 1.0));
    $$("#s8-bars rect").forEach((r, i) => tl.to(r, { scaleY: 1, duration: 0.55, ease: "power3.out" }, S.bars + i * 0.045));
    tl.to("#s8-line", { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, S.line);
    waterfall("#s8-hot .h", S.hotspots, { dy: 34, dur: 0.22, gap: 0.08 });
    press("#s8-gen", S.aiClick, 0.08);
    tl.to("#s8-gen", { backgroundColor: "#991b1b", duration: 0.1 }, S.aiClick);
    tl.to("#s8-gen", { backgroundColor: "#dc2626", duration: 0.3 }, S.aiClick + 0.1);
    tl.set("#s8-gen", { textContent: "Generating…" }, S.aiClick + 0.15);
    tl.set("#s8-gen", { textContent: "Decision support ready" }, S.aiTypeEnd);
    tl.set("#s8-plan", { whiteSpace: "pre-line" }, 0);
    type("#s8-plan", S.aiTypeStart,
      "Step #1 — Increase patrol visibility along the market road, 6–10 PM, for 14 days.\nWhy this is needed: 31 theft reports, 9 high severity, 4 SOS, peak evenings.\nCity Rule / Ordinance: Anti-snatching patrol protocol · RA 10591 for weapons.\nWhat this achieves: deterrence at the hotspot, faster response for open reports.",
      (320 / (S.aiTypeEnd - S.aiTypeStart)), "#s8-caret");
    $$("#s8-guard span").forEach((g, i) => tl.to(g, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.8)" }, S.guard + i * 0.1));
    ctcExit(stage, T.s9.start);
  }

  // ============ S9 · Routing & roles ============
  {
    const S = T.s9, stage = "#s9 .stage";
    hideWords("#s9 .w");
    ctcEntry(stage, S.start);
    tl.set("#s9 .node", { opacity: 0 }, 0);
    tl.set("#s9 .sevbadge", { opacity: 0, scale: 0.7 }, 0);
    tl.set("#s9-links path", { strokeDasharray: 700, strokeDashoffset: 700 }, 0);
    fadeIn("#s9-eb", S.title - 0.1);
    waterfall("#s9-title .w", S.title, { dy: 60, dur: 0.2 });
    arrive("#s9-n0", S.tiers, 50, 0.4);
    waterfall(["#s9-n1", "#s9-n2", "#s9-n3"], S.tiers + 0.25, { dy: 60, dur: 0.3, gap: 0.1 });
    tl.to("#s9-pA", { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" }, S.routeHigh);
    pop("#s9-bH", S.routeHigh + 0.3, 1, 0.4);
    tl.fromTo("#s9-n1", { boxShadow: "0 0 0 0 rgba(220,38,38,0)" }, { boxShadow: "0 0 0 8px rgba(220,38,38,0.16)", duration: 0.3 }, S.routeHigh + 0.45);
    tl.to("#s9-n1", { boxShadow: "0 0 0 0 rgba(220,38,38,0)", duration: 0.6 }, S.routeHigh + 0.9);
    tl.to("#s9-pB", { strokeDashoffset: 0, duration: 0.55, ease: "power2.inOut" }, S.routeLow);
    pop("#s9-bL", S.routeLow + 0.3, 1, 0.4);
    tl.fromTo("#s9-n2", { boxShadow: "0 0 0 0 rgba(245,158,11,0)" }, { boxShadow: "0 0 0 8px rgba(245,158,11,0.18)", duration: 0.3 }, S.routeLow + 0.45);
    tl.to("#s9-n2", { boxShadow: "0 0 0 0 rgba(245,158,11,0)", duration: 0.6 }, S.routeLow + 0.9);
    tl.to("#s9-pC", { strokeDashoffset: 0, duration: 0.45, ease: "power2.inOut" }, S.badge - 0.2);
    tl.fromTo("#s9-n3", { boxShadow: "0 0 0 0 rgba(15,23,42,0)" }, { boxShadow: "0 0 0 8px rgba(15,23,42,0.14)", duration: 0.3 }, S.badge + 0.2);
    tl.to("#s9-n3", { boxShadow: "0 0 0 0 rgba(15,23,42,0)", duration: 0.6 }, S.badge + 0.7);
    // exit: leftward speed streak — the stage accelerates out of frame while streaks sweep through
    tl.to(stage, { x: -520, filter: "blur(16px)", duration: 0.4, ease: "power4.in" }, T.s10.start - 0.4);
    tl.to(stage, { opacity: 0, duration: 0.25, ease: "none" }, T.s10.start - 0.3);
  }

  // ============ S10 · Streak → architecture ============
  {
    const S = T.s10, stage = "#s10 .stage";
    tl.set("#s10 .node", { opacity: 0 }, 0);
    tl.set("#s10-eb", { opacity: 0 }, 0);
    tl.set("#s10-links path", { strokeDasharray: 400, strokeDashoffset: 400 }, 0);
    $$("#s10 .s10-streak").forEach((s, i) => {
      tl.fromTo(s, { x: 1400 + i * 120, opacity: 0 }, { x: -1600, opacity: 1, duration: S.streakEnd - S.streak + 0.2, ease: "power2.in" }, S.streak - 0.15 + i * 0.03);
      tl.to(s, { opacity: 0, duration: 0.15 }, S.streakEnd + 0.05);
    });
    fadeIn("#s10-eb", S.nodes - 0.1);
    waterfall(["#s10-n1", "#s10-n2", "#s10-n3", "#s10-n5", "#s10-n4"], S.nodes, { dy: 70, dur: 0.3, gap: 0.1 });
    ["#s10-l1", "#s10-l2", "#s10-l3", "#s10-l4"].forEach((p, i) => tl.to(p, { strokeDashoffset: 0, duration: 0.4, ease: "power2.inOut" }, S.links + i * 0.12));
    pullExit(stage, T.s11.start);
  }

  // ============ S11 · Outro (Z arrival, then stillness) ============
  {
    const S = T.s11, stage = "#s11 .stage";
    hideWords("#s11 .w");
    tl.set("#s11-foot", { opacity: 0 }, 0);
    pullEntry(stage, S.start);
    tl.fromTo("#s11-mark", { scale: 1.08 }, { scale: 1, duration: 0.5, ease: "power3.out" }, S.logoLand);
    waterfall("#s11-word .w", S.wordmark, { dy: 90, dur: 0.24, gap: 0.09 });
    waterfall("#s11-tag .w", S.tagline, { dy: 40, dur: 0.16, gap: 0.08 });
    fadeIn("#s11-foot", S.hold, 0.5, 10);
  }

  tl.set({}, {}, T.duration); // pin the timeline length
  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
  window.__mainTimeline = tl;
  tl.seek(0);
})();
