/* ThreatTrack promo v2 — motion. Reference 2 grammar: hard block wipes, ghost-then-fill headlines,
   cards rising into place, content performing inside the card. Reference 1: the floating tilted phone. */
(function () {
  const T = window.TL;
  const tl = gsap.timeline({ paused: true });
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));
  const W = T.wipe;

  // Block wipe: the incoming section slides in from the left over the outgoing one (ref 2's cut).
  function wipeIn(sel, t) {
    tl.fromTo(sel, { x: -1920 }, { x: 0, duration: W, ease: "power4.inOut" }, t);
  }
  // Headline: ghost (dim) first, then fills to full colour — ref 2's reveal.
  function ghostFill(sel, t) {
    tl.fromTo(sel, { opacity: 0.3, y: 20 }, { opacity: 0.3, y: 0, duration: 0.35, ease: "power3.out" }, t);
    tl.to(sel, { opacity: 1, duration: 0.3, ease: "power2.out" }, t + 0.4);
  }
  function rise(sel, t, dy = 70, dur = 0.6) {
    tl.fromTo(sel, { opacity: 0, y: dy }, { opacity: 1, y: 0, duration: dur, ease: "power4.out" }, t);
  }
  function copyIn(scene, t) {
    rise(`${scene} .eyebrow`, t, 24, 0.4);
    ghostFill(`${scene} .head`, t + 0.1);
    rise(`${scene} .body`, t + 0.55, 24, 0.45);
  }
  function pop(sel, t, dur = 0.4) {
    tl.fromTo(sel, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: dur, ease: "back.out(1.8)" }, t);
  }
  function press(sel, t) {
    tl.to(sel, { scaleX: 1.03, scaleY: 0.93, duration: 0.1, ease: "power2.in" }, t);
    tl.to(sel, { scaleX: 1, scaleY: 1, duration: 0.45, ease: "back.out(2.2)" }, t + 0.1);
  }
  function count(sel, t, to, dur = 1.0) {
    const el = typeof sel === "string" ? $(sel) : sel, o = { n: 0 };
    tl.to(o, { n: to, duration: dur, ease: "power2.out", onUpdate: () => { el.textContent = Math.round(o.n).toLocaleString("en-US"); } }, t);
  }
  function type(sel, t, text, dur, caret) {
    const el = $(sel), o = { n: 0 };
    tl.to(o, { n: text.length, duration: dur, ease: "none", onUpdate: () => { el.textContent = text.slice(0, Math.round(o.n)); } }, t);
    if (caret) tl.to(caret, { opacity: 0, duration: 0.42, repeat: Math.ceil(dur / 0.42) + 4, yoyo: true, ease: "steps(1)" }, t);
  }

  // ===== S1 · intro =====
  {
    const S = T.s1;
    tl.set("#s1-pulse", { strokeDasharray: 2100, strokeDashoffset: 2100 }, 0);
    tl.set(["#s1-logo", "#s1-word", "#s1-tag"], { opacity: 0 }, 0);
    tl.to("#s1-pulse", { strokeDashoffset: 0, duration: S.logo - S.line, ease: "power2.inOut" }, S.line);
    pop("#s1-logo", S.logo, 0.6);
    rise("#s1-word", S.word, 40, 0.5);
    rise("#s1-tag", S.tag, 20, 0.4);
  }
  // ===== S2 · typographic beat =====
  {
    const S = T.s2;
    wipeIn("#s2", S.start);
    tl.set(["#s2-l1", "#s2-l2", "#s2-l3"], { opacity: 0 }, 0);
    [["#s2-l1", S.l1], ["#s2-l2", S.l2], ["#s2-l3", S.l3]].forEach(([id, t]) => rise(id, t, 50, 0.5));
    $$("#s2-ticks i").forEach((i, k) => tl.to(i, { backgroundColor: "#ffffff", duration: 0.1 }, S.tick + k * ((S.end - S.tick - 0.4) / 8)));
  }
  // ===== S3 · SOS =====
  {
    const S = T.s3;
    wipeIn("#s3", S.start);
    tl.set("#s3-rows", { opacity: 0 }, 0);
    tl.set(["#s3-r0", "#s3-r1", "#s3-r2", "#s3-r3"], { opacity: 0, y: 30 }, 0);
    rise("#s3-card", S.card, 90, 0.7);
    copyIn("#s3", S.head);
    // the hold: ring draws for three seconds, halo swells, button sinks (anticipation)
    tl.to("#s3-btn", { scale: 0.94, duration: 0.15, ease: "power2.in" }, S.press);
    tl.to("#s3-ring", { strokeDashoffset: 0, duration: S.holdEnd - S.press, ease: "none" }, S.press);
    tl.fromTo("#s3-halo", { scale: 1, opacity: 0.18 }, { scale: 1.45, opacity: 0.04, duration: S.holdEnd - S.press, ease: "power1.out" }, S.press);
    tl.set("#s3-label", { textContent: "Keep holding to continue", color: "#dc2626" }, S.press + 0.1);
    // release: overshoot spring, then the gate gives way to the dispatch rows
    tl.to("#s3-btn", { scale: 1.08, duration: 0.12, ease: "power2.out" }, S.release);
    tl.to("#s3-btn", { scale: 1, duration: 0.5, ease: "back.out(2.5)" }, S.release + 0.12);
    tl.to("#s3-halo", { scale: 2.2, opacity: 0, duration: 0.4, ease: "power3.out" }, S.release);
    tl.to("#s3-gate", { opacity: 0, y: -40, duration: 0.35, ease: "power3.in" }, S.sent - 0.1);
    tl.set("#s3-rows", { opacity: 1 }, S.sent);
    [["#s3-r0", S.sent], ["#s3-r1", S.row1], ["#s3-r2", S.row2], ["#s3-r3", S.row3]].forEach(([id, t]) => tl.to(id, { opacity: 1, y: 0, duration: 0.45, ease: "power4.out" }, t));
    tl.fromTo("#s3-r3", { scale: 0.97 }, { scale: 1, duration: 0.5, ease: "back.out(2)" }, S.row3);
  }
  // ===== S4 · report (floating phone) =====
  {
    const S = T.s4;
    wipeIn("#s4", S.start);
    tl.set("#s4-persp", { transformPerspective: 2400 }, 0);
    tl.set(["#s4-toast"], { opacity: 0, y: 30 }, 0);
    tl.fromTo("#s4-phone", { x: 320, y: 60, rotateY: -24, rotateX: 8, opacity: 0 }, { x: 0, y: 0, rotateY: -12, rotateX: 5, opacity: 1, duration: 0.9, ease: "power4.out" }, S.phone);
    copyIn("#s4", S.head);
    tl.to("#s4-cat", { backgroundColor: "#fff1f2", borderColor: "#dc2626", color: "#dc2626", duration: 0.2 }, S.chip);
    press("#s4-cat", S.chip);
    tl.to("#s4-st2", { backgroundColor: "#dc2626", duration: 0.2 }, S.role - 0.1);
    tl.to("#s4-role", { backgroundColor: "#fff1f2", borderColor: "#dc2626", duration: 0.2 }, S.role);
    press("#s4-role", S.role);
    tl.to("#s4-st3", { backgroundColor: "#dc2626", duration: 0.2 }, S.photo - 0.1);
    pop("#s4-photo .ok", S.photo);
    tl.fromTo("#s4-photo", { borderColor: "#e2e8f0" }, { borderColor: "#22c55e", duration: 0.25 }, S.photo);
    press("#s4-btn", S.submit);
    tl.to("#s4-btn", { opacity: 0, y: 20, duration: 0.25, ease: "power2.in" }, S.sent - 0.05);
    tl.to("#s4-toast", { opacity: 1, y: 0, duration: 0.45, ease: "power4.out" }, S.sent);
  }
  $$(".caption").forEach((c) => {
    const s = parseFloat(c.dataset.start), d = parseFloat(c.dataset.duration);
    tl.fromTo(c.firstElementChild, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out" }, s);
    tl.to(c.firstElementChild, { opacity: 0, duration: 0.25 }, s + d - 0.3);
  });
  // ===== S5 · status timeline =====
  {
    const S = T.s5;
    wipeIn("#s5", S.start);
    rise("#s5-card", S.card, 90, 0.7);
    copyIn("#s5", S.head);
    const on = (id, t, live) => {
      tl.to(id, { backgroundColor: live ? "#fff1f2" : "#f0fdf4", borderColor: live ? "#fecaca" : "#bbf7d0", color: live ? "#b91c1c" : "#0f172a", duration: 0.25 }, t);
      tl.to(`${id} .chk`, { backgroundColor: live ? "#dc2626" : "#22c55e", borderColor: live ? "#dc2626" : "#22c55e", duration: 0.25 }, t);
      tl.fromTo(`${id} .chk svg`, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, t + 0.05);
      tl.to(`${id} .t`, { color: live ? "#dc2626" : "#047857", duration: 0.25 }, t);
      tl.fromTo(id, { x: 0 }, { x: 10, duration: 0.12, ease: "power2.out", yoyo: true, repeat: 1 }, t);
    };
    on("#s5-p1", S.p1); on("#s5-p2", S.p2); on("#s5-p3", S.p3); on("#s5-p4", S.p4, true); on("#s5-p5", S.p5);
  }
  // ===== S6 · command center =====
  {
    const S = T.s6;
    wipeIn("#s6", S.start);
    tl.set("#s6-new", { opacity: 0, y: -60 }, 0);
    tl.set("#s6-queue .q:not(#s6-new)", { y: -90 }, 0);
    rise("#s6-card", S.card, 90, 0.7);
    copyIn("#s6", S.head);
    $$("#s6 .s6-num").forEach((el, i) => count(el, S.stats + i * 0.12, +el.dataset.to, 1.0));
    ["18:42:08 PHT", "18:42:09 PHT", "18:42:10 PHT", "18:42:11 PHT", "18:42:12 PHT"].forEach((s, i) => tl.set("#s6-clock", { textContent: s }, S.card + 0.8 + i));
    $$("#s6-queue .q:not(#s6-new)").forEach((q, i) => tl.fromTo(q, { opacity: 0 }, { opacity: 1, duration: 0.3 }, S.rows + i * 0.1));
    tl.to("#s6-queue .q:not(#s6-new)", { y: 0, duration: 0.5, ease: "power3.inOut" }, S.newRow);
    tl.to("#s6-new", { opacity: 1, y: 0, duration: 0.5, ease: "power4.out" }, S.newRow + 0.08);
    tl.fromTo("#s6-new", { boxShadow: "0 0 0 2px rgba(220,38,38,0.6), 0 0 0 0 rgba(220,38,38,0)" }, { boxShadow: "0 0 0 2px rgba(220,38,38,0.6), 0 0 0 18px rgba(220,38,38,0)", duration: 0.8, ease: "power2.out" }, S.flash);
    tl.fromTo("#s6 .stat.hot .v", { scale: 1.2 }, { scale: 1, duration: 0.4, ease: "back.out(2)" }, S.flash);
    tl.set("#s6 .stat.hot .v", { textContent: "4" }, S.flash);
  }
  // ===== S7 · split screen =====
  {
    const S = T.s7;
    wipeIn("#s7", S.start);
    tl.set(["#s7-ml", "#s7-mr"], { opacity: 0, y: 60 }, 0);
    tl.set(["#s7-verdict", "#s7-eta", "#s7-vs"], { opacity: 0, scale: 0.6 }, 0);
    tl.set("#s7-cursor", { opacity: 0 }, 0);
    tl.fromTo("#s7-l .who, #s7-l .name", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.08 }, S.title);
    tl.fromTo("#s7-r .who, #s7-r .name", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.08 }, S.title + 0.1);
    pop("#s7-vs", S.title + 0.3, 0.5);
    tl.to("#s7-ml", { opacity: 1, y: 0, duration: 0.6, ease: "power4.out" }, S.left);
    tl.to("#s7-mr", { opacity: 1, y: 0, duration: 0.6, ease: "power4.out" }, S.right);
    tl.to("#s7-bar", { width: "87%", duration: S.scoreEnd - S.score, ease: "power2.inOut" }, S.score);
    count("#s7-score", S.score, 87, S.scoreEnd - S.score);
    pop("#s7-verdict", S.verdict, 0.45);
    // cursor walks the eye to Dispatch and clicks; the citizen side answers
    tl.set("#s7-cursor", { opacity: 1 }, S.verdict + 0.2);
    tl.fromTo("#s7-cursor", { x: 0 }, { x: -60, duration: S.click - S.verdict - 0.2, ease: "power2.inOut" }, S.verdict + 0.2);
    tl.fromTo("#s7-cursor", { y: 0 }, { y: -250, duration: S.click - S.verdict - 0.2, ease: "power3.out" }, S.verdict + 0.2);
    tl.to("#s7-cursor", { scale: 0.8, duration: 0.08 }, S.click);
    tl.to("#s7-cursor", { scale: 1, duration: 0.3, ease: "back.out(2)" }, S.click + 0.08);
    press("#s7-cta", S.click);
    tl.to("#s7-cta", { backgroundColor: "#22c55e", duration: 0.25 }, S.click + 0.15);
    tl.set("#s7-cta", { textContent: "Dispatched · Mapulang Lupa SS-MPL" }, S.click + 0.2);
    tl.to("#s7-cursor", { opacity: 0, x: 40, y: -300, duration: 0.4, ease: "power2.in" }, S.way);
    tl.to("#s7-ml-big", { opacity: 0, y: -10, duration: 0.2, ease: "power2.in" }, S.way - 0.2);
    tl.set("#s7-ml-big", { textContent: "Help is on the way.", color: "#b91c1c" }, S.way);
    tl.set("#s7-ml-sub", { textContent: "Mapulang Lupa Police Sub-station acknowledged your report" }, S.way);
    tl.to("#s7-ml-big", { opacity: 1, y: 0, duration: 0.4, ease: "power4.out" }, S.way);
    tl.to("#s7-eta", { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)" }, S.eta);
    tl.fromTo("#s7-vs", { backgroundColor: "#0b1220" }, { backgroundColor: "#22c55e", duration: 0.3 }, S.way);
  }
  // ===== S8 · hotspot grid =====
  {
    const S = T.s8;
    wipeIn("#s8", S.start);
    // build 8x6 tiles deterministically (no Math.random)
    const grid = $("#s8-tiles");
    const pattern = "rgabraga.bargaraa.gagrbagr.rbgaarbg.agbarbgb.rgragbar".replace(/\./g, "");
    for (let i = 0; i < 48; i++) { const d = document.createElement("div"); d.className = "tile " + ({ r: "r", a: "a", b: "b", g: "" }[pattern[i]] || ""); grid.appendChild(d); }
    const tiles = $$("#s8-tiles .tile");
    tl.set(tiles, { opacity: 0, scale: 0.4 }, 0);
    tl.set(["#s8-hot", "#s8-copy"], { opacity: 0, y: 60 }, 0);
    tl.set(["#s8-h1", "#s8-h2", "#s8-h3"], { opacity: 0, x: 30 }, 0);
    rise("#s8-lbl", S.title, 20, 0.4);
    tiles.forEach((tile, i) => tl.to(tile, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.6)" }, S.tiles + (i % 8) * 0.06 + Math.floor(i / 8) * 0.12));
    tl.to("#s8-hot", { opacity: 1, y: 0, duration: 0.6, ease: "power4.out" }, S.card);
    [["#s8-h1", S.r1], ["#s8-h2", S.r2], ["#s8-h3", S.r3]].forEach(([id, t]) => tl.to(id, { opacity: 1, x: 0, duration: 0.4, ease: "power4.out" }, t));
    tl.to("#s8-copy", { opacity: 1, y: 0, duration: 0.5, ease: "power4.out" }, S.head);
    ghostFill("#s8-copy .head", S.head);
  }
  // ===== S9 · AI =====
  {
    const S = T.s9;
    wipeIn("#s9", S.start);
    tl.set("#s9-guard span", { opacity: 0, scale: 0.7 }, 0);
    rise("#s9-card", S.card, 90, 0.7);
    copyIn("#s9", S.head);
    type("#s9-plan", S.typeStart,
      "Recommended action plan · Mapulang Lupa market road\n\nStep 1  Increase patrol visibility 6–10 PM for 14 days.\nWhy  31 theft reports, 9 high severity, 4 SOS, peak evenings.\nStep 2  Coordinate with the barangay desk on lighting and CCTV review.\nStep 3  Prioritise the 6 open reports from this cluster.",
      S.typeEnd - S.typeStart, "#s9-caret");
    $$("#s9-guard span").forEach((g, i) => tl.to(g, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.8)" }, S.guard + i * 0.12));
  }
  // ===== S10 · every role =====
  {
    const S = T.s10;
    wipeIn("#s10", S.start);
    tl.set("#s10-chips .chip", { opacity: 0, y: 30 }, 0);
    tl.fromTo("#s10-glow", { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.2, ease: "power2.out" }, S.title);
    rise("#s10-title", S.title, 30, 0.5);
    $$("#s10-chips .chip").forEach((c, i) => tl.to(c, { opacity: 1, y: 0, duration: 0.4, ease: "power4.out" }, S.chips + i * ((S.chipsEnd - S.chips) / 15)));
  }
  // ===== S11 · outro =====
  {
    const S = T.s11;
    wipeIn("#s11", S.start);
    tl.set("#s11-line", { strokeDasharray: 2000, strokeDashoffset: 2000 }, 0);
    tl.set(["#s11-logo", "#s11-word", "#s11-tag", "#s11-pill"], { opacity: 0 }, 0);
    tl.fromTo("#s11-glow", { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.0, ease: "power2.out" }, S.glow);
    pop("#s11-logo", S.glow + 0.1, 0.6);
    tl.to("#s11-line", { strokeDashoffset: 0, duration: 0.9, ease: "power2.inOut" }, S.line);
    rise("#s11-word", S.word, 40, 0.5);
    rise("#s11-tag", S.tag, 20, 0.4);
    pop("#s11-pill", S.pill, 0.45);
  }

  tl.set({}, {}, T.duration);
  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
  window.__mainTimeline = tl;
  tl.seek(0);
})();
