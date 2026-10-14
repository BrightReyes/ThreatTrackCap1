/* ThreatTrack promo v5 — Apple grammar: type is the hero, UI is the evidence, hard cuts on the beat.
   ThreatTrack's own devices: radar, case HUD + log ticker, diagonal split, flatline. */
(function () {
  const T = window.TL;
  const tl = gsap.timeline({ paused: true });
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // ---------- helpers ----------
  // Apple-style word snap: letters arrive big and blurred, settle sharp; one tight stagger.
  function snap(sel, t, gap = 0.08, from = {}) {
    const words = $$(`${sel} .w`);
    tl.set(words, { opacity: 0 }, 0);
    words.forEach((w, i) => tl.fromTo(w, { opacity: 0, y: 50, scale: 1.25, filter: "blur(14px)", ...from },
      { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.42, ease: "expo.out" }, t + i * gap));
  }
  function snapOut(sel, t) { tl.to(`${sel} .w`, { opacity: 0, y: -40, scale: 1.1, filter: "blur(10px)", duration: 0.25, ease: "power3.in", stagger: 0.03 }, t); }
  function rise(sel, t, dy = 60, dur = 0.55) { tl.fromTo(sel, { opacity: 0, y: dy }, { opacity: 1, y: 0, duration: dur, ease: "power4.out" }, t); }
  function pop(sel, t, dur = 0.4) { tl.fromTo(sel, { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: dur, ease: "back.out(1.8)" }, t); }
  function press(sel, t) { tl.to(sel, { scaleX: 1.03, scaleY: 0.93, duration: 0.1, ease: "power2.in" }, t); tl.to(sel, { scaleX: 1, scaleY: 1, duration: 0.45, ease: "back.out(2.2)" }, t + 0.1); }
  function count(sel, t, to, dur = 1.0) { const el = typeof sel === "string" ? $(sel) : sel, o = { n: 0 }; tl.to(o, { n: to, duration: dur, ease: "power2.out", onUpdate: () => { el.textContent = Math.round(o.n).toLocaleString("en-US"); } }, t); }
  function type(sel, t, text, dur, caret) { const el = $(sel), o = { n: 0 }; tl.to(o, { n: text.length, duration: dur, ease: "none", onUpdate: () => { el.textContent = text.slice(0, Math.round(o.n)); } }, t); if (caret) tl.to(caret, { opacity: 0, duration: 0.42, repeat: Math.ceil(dur / 0.42) + 4, yoyo: true, ease: "steps(1)" }, t); }
  // camera drive + impact punch
  function drive(scene, t0, t1, amount = 1.06) { tl.fromTo(`${scene} .in`, { scale: 1 }, { scale: amount, duration: t1 - t0, ease: "none" }, t0); }
  // impact shake: heroes only, half strength
  function punch(scene, t) { tl.fromTo(`${scene} .in`, { x: 0 }, { x: 4, duration: 0.06 }, t); tl.to(`${scene} .in`, { x: -3, duration: 0.08 }, t + 0.06); tl.to(`${scene} .in`, { x: 0, duration: 0.2, ease: "power3.out" }, t + 0.14); }
  const noShake = () => {};
  // card arrives from depth (z) like a product shot, with a slight tilt that straightens
  function cardIn(sel, t) { tl.fromTo(sel, { opacity: 0, scale: 0.82, y: 60, rotateY: -14, rotateX: 6, transformPerspective: 1600 }, { opacity: 1, scale: 1, y: 0, rotateY: -6, rotateX: 3, duration: 0.7, ease: "expo.out" }, t); }
  function blip(sel, t) { tl.fromTo(sel, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, t); tl.fromTo(`${sel} i`, { scale: 1, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.9, ease: "power2.out" }, t + 0.05); }
  function irisIn(sel, t) {
    tl.fromTo(sel, { clipPath: "circle(0px at 960px 540px)" }, { clipPath: "circle(1400px at 960px 540px)", duration: 0.6, ease: "power3.inOut" }, t);
    tl.fromTo("#sweep", { rotate: -40, opacity: 0 }, { rotate: 320, opacity: 0.9, duration: 0.55, ease: "power2.inOut" }, t - 0.05);
    tl.to("#sweep", { opacity: 0, duration: 0.2 }, t + 0.5);
  }

  // ===== S1 · radar finds the mark =====
  { const S = T.s1;
    tl.set(["#s1-logo", "#s1-word", "#s1-eb", "#s1-b1", "#s1-b2", "#s1-b3"], { opacity: 0 }, 0);
    $$("#s1-radar .ring").forEach((r, i) => tl.fromTo(r, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: "power3.out" }, S.radar + i * 0.1));
    tl.fromTo("#s1-beam", { rotate: 0, opacity: 0 }, { rotate: 720, opacity: 1, duration: S.logo - S.radar + 0.2, ease: "power1.inOut" }, S.radar);
    blip("#s1-b1", S.radar + 0.5); blip("#s1-b2", S.radar + 0.85); blip("#s1-b3", S.radar + 1.15);
    rise("#s1-eb", S.radar + 0.3, 16, 0.4);
    tl.to(["#s1-beam", "#s1-eb"], { opacity: 0, duration: 0.3 }, S.logo);
    tl.to("#s1-radar .ring", { opacity: 0.3, duration: 0.5 }, S.logo);
    pop("#s1-logo", S.logo, 0.55); punch("#s1", S.logo + 0.1);
    rise("#s1-word", S.word, 40, 0.5);
    drive("#s1", S.logo, S.end, 1.08);
  }
  // ===== S2 / S3 · kinetic type =====
  { const S = T.s2; snap("#s2-kt", S.w1, 0.3); drive("#s2", S.start, S.end, 1.07); snapOut("#s2-kt", S.end - 0.25); }
  { const S = T.s3; snap("#s3-kt", S.w1, 0.38); noShake("#s3", S.w1 + 0.1); drive("#s3", S.start, S.end, 1.07); snapOut("#s3-kt", S.end - 0.25); }
  // ===== S4 · collage: screens fly in from depth, drift, then one zooms through =====
  { const S = T.s4;
    const shots = $$("#s4 .sh");
    shots.forEach((sh, i) => {
      const z = -1400 - i * 200, dx = (i % 2 ? 1 : -1) * (120 + i * 30);
      tl.fromTo(sh, { opacity: 0, z, x: dx, rotateY: (i % 2 ? -1 : 1) * 18, transformPerspective: 1800 }, { opacity: 1, z: 0, x: 0, rotateY: (i % 2 ? -1 : 1) * 4, duration: 0.75, ease: "expo.out" }, S.fly + i * 0.07);
      tl.to(sh, { y: (i % 2 ? -1 : 1) * 18, duration: S.zoom - S.settle, ease: "none" }, S.settle);
    });
    tl.fromTo("#s4-icons span", { opacity: 0, y: 40, scale: 0.6 }, { opacity: 1, y: 0, scale: 1, duration: 0.4, ease: "back.out(1.8)", stagger: 0.05 }, S.settle + 0.1);
    tl.to("#s4 .in", { scale: 2.4, x: -400, y: 300, filter: "blur(6px)", duration: S.end - S.zoom + 0.1, ease: "power3.in" }, S.zoom);
    noShake("#s4", S.settle);
  }
  // ===== S5 · Report. Track. Respond. =====
  { const S = T.s5;
    tl.set(["#s5-a", "#s5-b", "#s5-c"], { opacity: 0 }, 0);
    [["#s5-a", S.a], ["#s5-b", S.b], ["#s5-c", S.c]].forEach(([id, t], i) => {
      tl.fromTo(id, { opacity: 0, scale: 2.2, filter: "blur(16px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.32, ease: "expo.out" }, t);
      if (i < 2) tl.to(id, { opacity: 0, scale: 0.8, filter: "blur(8px)", duration: 0.2, ease: "power3.in" }, [S.b, S.c][i] - 0.05);
      noShake("#s5", t + 0.05);
    });
    drive("#s5", S.start, S.end, 1.1);
  }
  // ===== feature beat template: headline snaps on the left, card lands on the right =====
  function beat(scene, S, cardSel, extra = {}) {
    snap(`${scene} .kt`, S.head, 0.09);
    rise(`${scene} .sub-kt`, S.head + 0.5, 30, 0.45);
    if (cardSel) { cardIn(cardSel, S.card ?? S.head + 0.3); if (scene === "#s9") punch(scene, (S.card ?? S.head + 0.3) + 0.4); }
    drive(scene, S.start, S.end, extra.drive ?? 1.05);
    snapOut(`${scene} .kt`, S.end - 0.22);
    tl.to(`${scene} .sub-kt`, { opacity: 0, y: -20, duration: 0.2 }, S.end - 0.22);
    if (cardSel) tl.to(cardSel, { opacity: 0, scale: 1.06, filter: "blur(8px)", duration: 0.22, ease: "power3.in" }, S.end - 0.22);
  }
  // ===== S6 · Hold. =====
  { const S = T.s6;
    beat("#s6", S, "#s6-card");
    tl.set("#s6-rows", { opacity: 0 }, 0);
    tl.set(["#s6-r0", "#s6-r1", "#s6-r2", "#s6-r3"], { opacity: 0, x: 140 }, 0);
    tl.to("#s6-btn", { scale: 0.94, duration: 0.15, ease: "power2.in" }, S.press);
    tl.to("#s6-ring", { strokeDashoffset: 0, duration: S.holdEnd - S.press, ease: "none" }, S.press);
    tl.fromTo("#s6-halo", { scale: 1, opacity: 0.18 }, { scale: 1.45, opacity: 0.04, duration: S.holdEnd - S.press, ease: "power1.out" }, S.press);
    tl.set("#s6-label", { textContent: "Keep holding to continue", color: "#dc2626" }, S.press + 0.1);
    tl.to("#s6-btn", { scale: 1.08, duration: 0.12, ease: "power2.out" }, S.release);
    tl.to("#s6-btn", { scale: 1, duration: 0.5, ease: "back.out(2.5)" }, S.release + 0.12);
    tl.to("#s6-halo", { scale: 2.2, opacity: 0, duration: 0.4, ease: "power3.out" }, S.release);
    punch("#s6", S.release + 0.05);
    tl.to("#s6-gate", { opacity: 0, y: -40, duration: 0.3, ease: "power3.in" }, S.sent - 0.1);
    tl.set("#s6-rows", { opacity: 1 }, S.sent);
    [["#s6-r0", S.sent], ["#s6-r1", S.row1], ["#s6-r2", S.row2], ["#s6-r3", S.row3]].forEach(([id, t]) => tl.to(id, { opacity: 1, x: 0, duration: 0.45, ease: "power4.out" }, t));
  }
  // ===== S7 · Report in three taps. =====
  { const S = T.s7;
    beat("#s7", S, null);
    tl.set("#s7-persp", { transformPerspective: 2400 }, 0);
    tl.set("#s7-toast", { opacity: 0, y: 30 }, 0);
    tl.fromTo("#s7-phone", { x: 320, y: 80, rotateY: -28, rotateX: 8, opacity: 0 }, { x: 0, y: 0, rotateY: -12, rotateX: 5, opacity: 1, duration: 0.8, ease: "expo.out" }, S.phone);
    tl.to("#s7-phone", { rotateY: -4, rotateX: 2, duration: S.end - S.phone - 0.8, ease: "none" }, S.phone + 0.8);
    noShake("#s7", S.phone + 0.5);
    tl.to("#s7-cat", { backgroundColor: "#fff1f2", borderColor: "#dc2626", color: "#dc2626", duration: 0.2 }, S.chip); press("#s7-cat", S.chip);
    tl.to("#s7-st2", { backgroundColor: "#dc2626", duration: 0.2 }, S.role - 0.1);
    tl.to("#s7-role", { backgroundColor: "#fff1f2", borderColor: "#dc2626", duration: 0.2 }, S.role); press("#s7-role", S.role);
    tl.to("#s7-st3", { backgroundColor: "#dc2626", duration: 0.2 }, S.photo - 0.1);
    pop("#s7-photo .ok", S.photo); tl.fromTo("#s7-photo", { borderColor: "#e2e8f0" }, { borderColor: "#22c55e", duration: 0.25 }, S.photo);
    press("#s7-btn", S.submit); noShake("#s7", S.submit + 0.05);
    tl.to("#s7-btn", { opacity: 0, y: 20, duration: 0.25, ease: "power2.in" }, S.sent - 0.05);
    tl.to("#s7-toast", { opacity: 1, y: 0, duration: 0.45, ease: "power4.out" }, S.sent);
    tl.to("#s7-phone", { opacity: 0, x: 200, duration: 0.25, ease: "power3.in" }, S.end - 0.22);
  }
  // ===== S8 · Track every step. =====
  { const S = T.s8;
    beat("#s8", S, "#s8-card");
    const on = (id, t, live) => {
      tl.to(id, { backgroundColor: live ? "#fff1f2" : "#f0fdf4", borderColor: live ? "#fecaca" : "#bbf7d0", color: live ? "#b91c1c" : "#0f172a", duration: 0.2 }, t);
      tl.to(`${id} .chk`, { backgroundColor: live ? "#dc2626" : "#22c55e", borderColor: live ? "#dc2626" : "#22c55e", duration: 0.2 }, t);
      tl.fromTo(`${id} .chk svg`, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, t + 0.05);
      tl.to(`${id} .t`, { color: live ? "#dc2626" : "#047857", duration: 0.2 }, t);
      tl.fromTo(id, { x: 0, scale: 1 }, { x: 14, scale: 1.03, duration: 0.12, ease: "power2.out", yoyo: true, repeat: 1 }, t);
    };
    on("#s8-p1", S.p1); on("#s8-p2", S.p2); on("#s8-p3", S.p3); on("#s8-p4", S.p4, true); on("#s8-p5", S.p5);
  }
  // ===== S9 · live command center =====
  { const S = T.s9;
    beat("#s9", S, "#s9-card");
    tl.set("#s9-new", { opacity: 0, y: -60 }, 0);
    tl.set("#s9-queue .q:not(#s9-new)", { y: -90 }, 0);
    $$("#s9 .stat").forEach((st, i) => tl.fromTo(st, { scale: 0.7, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(2)" }, S.stats + i * 0.1));
    $$("#s9 .s9-num").forEach((el, i) => count(el, S.stats + i * 0.12, +el.dataset.to, 0.9));
    ["18:42:08 PHT", "18:42:09 PHT", "18:42:10 PHT"].forEach((s, i) => tl.set("#s9-clock", { textContent: s }, S.card + 0.8 + i));
    $$("#s9-queue .q:not(#s9-new)").forEach((q, i) => tl.fromTo(q, { opacity: 0, x: 260 }, { opacity: 1, x: 0, duration: 0.45, ease: "power4.out" }, S.rows + i * 0.1));
    tl.to("#s9-queue .q:not(#s9-new)", { y: 0, duration: 0.5, ease: "power3.inOut" }, S.newRow);
    tl.to("#s9-new", { opacity: 1, y: 0, duration: 0.5, ease: "power4.out" }, S.newRow + 0.08);
    tl.fromTo("#s9-new", { boxShadow: "0 0 0 2px rgba(255,59,48,0.7), 0 0 0 0 rgba(255,59,48,0)" }, { boxShadow: "0 0 0 2px rgba(255,59,48,0.7), 0 0 0 18px rgba(255,59,48,0)", duration: 0.8, ease: "power2.out" }, S.flash);
    tl.fromTo("#s9 .stat.hot .v", { scale: 1.2 }, { scale: 1, duration: 0.4, ease: "back.out(2)" }, S.flash);
    tl.set("#s9 .stat.hot .v", { textContent: "4" }, S.flash);
    noShake("#s9", S.newRow + 0.3);
  }
  // ===== S10 · One click. split =====
  { const S = T.s10;
    tl.set(["#s10-ml", "#s10-mr"], { opacity: 0, y: 60 }, 0);
    tl.set(["#s10-verdict", "#s10-eta", "#s10-vs"], { opacity: 0, scale: 0.6 }, 0);
    tl.set("#s10-cursor", { opacity: 0 }, 0);
    tl.fromTo("#s10-l", { x: -500 }, { x: 0, duration: 0.6, ease: "expo.out" }, S.start + 0.05);
    tl.fromTo("#s10-r", { x: 500 }, { x: 0, duration: 0.6, ease: "expo.out" }, S.start + 0.05);
    snap("#s10-kt", S.head + 0.2, 0.1);
    tl.fromTo("#s10-l .who, #s10-l .name, #s10-r .who, #s10-r .name", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4, ease: "power3.out", stagger: 0.06 }, S.head + 0.2);
    pop("#s10-vs", S.head + 0.5, 0.5);
    tl.to("#s10-ml", { opacity: 1, y: 0, duration: 0.6, ease: "expo.out" }, S.left);
    tl.to("#s10-mr", { opacity: 1, y: 0, duration: 0.6, ease: "expo.out" }, S.right);
    tl.to("#s10-bar", { width: "87%", duration: S.scoreEnd - S.score, ease: "power2.inOut" }, S.score);
    count("#s10-score", S.score, 87, S.scoreEnd - S.score);
    pop("#s10-verdict", S.verdict, 0.45);
    tl.set("#s10-cursor", { opacity: 1 }, S.verdict + 0.15);
    tl.fromTo("#s10-cursor", { x: 0 }, { x: -60, duration: S.click - S.verdict - 0.15, ease: "power2.inOut" }, S.verdict + 0.15);
    tl.fromTo("#s10-cursor", { y: 0 }, { y: -250, duration: S.click - S.verdict - 0.15, ease: "power3.out" }, S.verdict + 0.15);
    tl.to("#s10-cursor", { scale: 0.8, duration: 0.08 }, S.click); tl.to("#s10-cursor", { scale: 1, duration: 0.3, ease: "back.out(2)" }, S.click + 0.08);
    press("#s10-cta", S.click); punch("#s10", S.click + 0.05);
    tl.to("#s10-cta", { backgroundColor: "#30d158", color: "#052e16", duration: 0.25 }, S.click + 0.15);
    tl.set("#s10-cta", { textContent: "Dispatched · Mapulang Lupa SS-MPL" }, S.click + 0.2);
    tl.to("#s10-cursor", { opacity: 0, x: 40, y: -300, duration: 0.4, ease: "power2.in" }, S.way);
    tl.to("#s10-ml-big", { opacity: 0, y: -10, duration: 0.2, ease: "power2.in" }, S.way - 0.2);
    tl.set("#s10-ml-big", { textContent: "Help is on the way.", color: "#b91c1c" }, S.way);
    tl.set("#s10-ml-sub", { textContent: "Mapulang Lupa Police Sub-station acknowledged your report" }, S.way);
    tl.to("#s10-ml-big", { opacity: 1, y: 0, duration: 0.4, ease: "power4.out" }, S.way);
    tl.to("#s10-eta", { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.8)" }, S.eta);
    tl.set("#s10-vs-t", { textContent: "T+05:55" }, S.way); tl.set("#s10-vs small", { textContent: "HELP SENT" }, S.way);
    tl.fromTo("#s10-vs", { backgroundColor: "#0b1220" }, { backgroundColor: "#166534", duration: 0.3 }, S.way);
    drive("#s10", S.head, S.end, 1.05);
    tl.to("#s10 .in", { opacity: 0, scale: 1.08, filter: "blur(8px)", duration: 0.25, ease: "power3.in" }, S.end - 0.25);
  }
  // ===== S11 · See it coming. radar =====
  { const S = T.s11;
    irisIn("#s11", S.start);
    tl.set($$("#s11-radar .blip"), { opacity: 0 }, 0);
    tl.set(["#s11-hot"], { opacity: 0, y: 40 }, 0);
    tl.set("#s11-h1", { opacity: 0, x: 30 }, 0);
    $$("#s11-radar .ring").forEach((r, i) => tl.fromTo(r, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "power3.out" }, S.radar + i * 0.08));
    tl.fromTo("#s11-radar .poly", { opacity: 0 }, { opacity: 1, duration: 0.5 }, S.radar + 0.3);
    tl.fromTo("#s11-beam", { rotate: 0 }, { rotate: 360 * 2.5, duration: S.end - S.radar, ease: "none" }, S.radar);
    ["#s11-b1", "#s11-b2", "#s11-b3", "#s11-b4", "#s11-b5", "#s11-b6"].forEach((id, i) => blip(id, S.blips + i * 0.2));
    snap("#s11-kt", S.head + 0.3, 0.1);
    rise("#s11-sub", S.head + 0.9, 30, 0.45);
    tl.to("#s11-hot", { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, S.card);
    tl.to("#s11-h1", { opacity: 1, x: 0, duration: 0.4, ease: "power4.out" }, S.card + 0.25);
    noShake("#s11", S.blips + 0.2);
    drive("#s11", S.radar, S.end, 1.05);
    snapOut("#s11-kt", S.end - 0.22);
    tl.to(["#s11-sub", "#s11-hot", "#s11-radar"], { opacity: 0, duration: 0.2 }, S.end - 0.2);
  }
  // ===== S12 · AI drafts. Officers decide. =====
  { const S = T.s12;
    beat("#s12", S, "#s12-card");
    tl.set("#s12-guard span", { opacity: 0, scale: 0.7 }, 0);
    tl.set("#s12-caret", { opacity: 0 }, 0);
    tl.set("#s12-caret", { opacity: 1 }, S.typeStart);
    type("#s12-plan", S.typeStart, "Recommended action plan · Mapulang Lupa market road\n\nStep 1  Increase patrol visibility 6–10 PM for 14 days.\nWhy  31 theft reports, 9 high severity, 4 SOS, peak evenings.\nStep 2  Coordinate with the barangay desk on lighting and CCTV review.\nStep 3  Prioritise the 6 open reports from this cluster.", S.typeEnd - S.typeStart, "#s12-caret");
    $$("#s12-guard span").forEach((g, i) => tl.to(g, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.8)" }, S.guard + i * 0.1));
  }
  // ===== S13 · role storm: one phrase per beat =====
  { const S = T.s13;
    const ws = ["#s13-w0", "#s13-w1", "#s13-w2", "#s13-w3", "#s13-w4", "#s13-w5"];
    ws.forEach((id, i) => {
      const t = S.w[i], next = S.w[i + 1] ?? S.end;
      snap(id, t, 0.06, { x: (i % 2 ? 1 : -1) * 120 });
      if (i < 5) snapOut(id, next - 0.15);
      noShake("#s13", t + 0.05);
    });
    tl.fromTo("#s13-t", { opacity: 0, letterSpacing: "0.6em" }, { opacity: 1, letterSpacing: "0.2em", duration: 1.2, ease: "power3.out" }, S.w[0] + 0.3);
    drive("#s13", S.start, S.end, 1.12);
    tl.to("#s13 .in", { opacity: 0, duration: 0.2 }, S.end - 0.2);
  }
  // ===== S14 · collage returns, the line lands =====
  { const S = T.s14;
    const shots = $$("#s14 .sh2");
    shots.forEach((sh, i) => {
      tl.fromTo(sh, { opacity: 0, z: -1600, x: (i % 2 ? 1 : -1) * 200, rotateY: (i % 2 ? -1 : 1) * 20, transformPerspective: 1800 }, { opacity: 0.55, z: 0, x: 0, rotateY: (i % 2 ? -1 : 1) * 5, duration: 0.8, ease: "expo.out" }, S.fly + i * 0.06);
      tl.to(sh, { y: (i % 2 ? -1 : 1) * 22, duration: S.end - S.settle, ease: "none" }, S.settle);
    });
    snap("#s14-kt", S.title, 0.09);
    noShake("#s14", S.title + 0.1);
    drive("#s14", S.fly, S.end, 1.06);
    tl.to("#s14 .in", { opacity: 0, scale: 1.1, filter: "blur(10px)", duration: 0.3, ease: "power3.in" }, S.end - 0.3);
  }
  // ===== S15 · flatline → resolved → logo =====
  { const S = T.s15;
    tl.set("#s15-line", { strokeDasharray: 2200, strokeDashoffset: 2200 }, 0);
    tl.set(["#s15-logo", "#s15-word", "#s15-tag", "#s15-pill", "#s15-res"], { opacity: 0 }, 0);
    tl.fromTo("#s15-glow", { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.0, ease: "power2.out" }, S.logo - 0.3);
    tl.to("#s15-line", { strokeDashoffset: 0, duration: 1.1, ease: "power2.inOut" }, S.line);
    rise("#s15-res", S.res, 12, 0.4);
    pop("#s15-logo", S.logo, 0.6); punch("#s15", S.logo + 0.3);
    rise("#s15-word", S.word, 40, 0.5);
    rise("#s15-tag", S.tag, 20, 0.4);
    pop("#s15-pill", S.pill, 0.45);
    drive("#s15", S.logo, S.end, 1.05);
  }
  // ===== persistent dispatch HUD + log ticker =====
  { const h0 = 17.65, hEnd = 51.2, jump = T.s11.start;
    const fmt = (sec) => { const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60); return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":"); };
    const base1 = 18 * 3600 + 41 * 60 + 7, base2 = 19 * 3600 + 12 * 60 + 7;
    for (let t = h0; t < hEnd; t += 1) { const sec = t < jump ? base1 + Math.round(t - h0) : base2 + Math.round(t - jump); tl.set("#hud-clock", { textContent: fmt(sec) }, +t.toFixed(2)); }
    tl.fromTo("#hud", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, h0);
    tl.fromTo("#ticker", { y: 46 }, { y: 0, duration: 0.5, ease: "power3.out" }, h0);
    const tape = $("#tape"); const w = Math.max(tape.scrollWidth, 4000);
    tl.fromTo(tape, { x: 0 }, { x: -w, duration: hEnd - h0, ease: "none" }, h0);
    const status = (t, text, bg) => { const dark = bg === "#ff9f0a" || bg === "#30d158"; tl.to("#hud-st", { scale: 0.85, opacity: 0, duration: 0.15, ease: "power2.in" }, t - 0.15); tl.set("#hud-st", { textContent: text, backgroundColor: bg, color: dark ? "#111111" : "#ffffff" }, t); tl.to("#hud-st", { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" }, t); };
    status(T.s7.sent, "SUBMITTED", "#ff3b30");
    status(T.s8.p2, "UNDER REVIEW", "#ff9f0a");
    status(T.s8.p3, "VERIFIED", "#0a84ff");
    status(T.s8.p4, "RESPONDING", "#7c3aed");
    status(T.s10.way, "HELP ON THE WAY", "#7c3aed");
    status(T.s11.start + 0.3, "RESOLVED", "#30d158");
  }

  tl.set({}, {}, T.duration);
  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
  window.__mainTimeline = tl;
  tl.seek(0);
})();
