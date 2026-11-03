// assets/anim.js — Broadcast Cinematography Primitives (GSAP v3.12.5)
// ThreatTrack Promo v3 — all times below are SOURCE seconds; TL.warp (tools/retime.mjs) maps them to the VO-timed output.

/**
 * 1. Kinetic word reveal: 2D glide + fade (no blur, no 3D pitch — both stutter in headless capture).
 *    Legacy rotX/blur options from older call sites are accepted and ignored.
 */
function snap(tl, targets, at, opts = {}) {
  const { stagger = 0.05, duration = 0.75, ease = "expo.out" } = opts;
  const y = Math.min(Math.abs(opts.y ?? 24), 28);

  const elements = typeof targets === "string" ? document.querySelectorAll(`${targets} .w`) : targets;
  if (!elements || elements.length === 0) return;

  tl.fromTo(elements, { opacity: 0, y }, { opacity: 1, y: 0, duration, stagger, ease }, at);
}

/**
 * 2. Word exit: short lift + fade. The whole stagger finishes within 0.24s of `at`, so callers that
 *    pass `S.end - 0.22/0.25` are fully clear before the cut (no half-visible words on the next frame).
 */
function snapOut(tl, targets, at) {
  const elements = typeof targets === "string" ? document.querySelectorAll(`${targets} .w`) : targets;
  if (!elements || elements.length === 0) return;

  tl.to(elements, { opacity: 0, y: -20, duration: 0.18, stagger: { amount: 0.04 }, ease: "power2.in" }, at);
}

/**
 * 3. Smooth Upward Card Glide (Zero 3D Tilt) + Specular Light Sweep
 */
function cardIn(tl, cardEl, at, opts = {}) {
  const {
    fromY = 32,
    driftDuration = 3.8,
    sheenSelector = ".light-sheen"
  } = opts;

  const el = typeof cardEl === "string" ? document.querySelector(cardEl) : cardEl;
  if (!el) return;

  // Smooth upward glide in 2D
  tl.fromTo(
    el,
    {
      opacity: 0,
      y: fromY,
      scale: 0.96
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      duration: 0.85,
      ease: "power3.out"
    },
    at
  );

  // Specular light reflection sweep
  const sheen = el.querySelector(sheenSelector);
  if (sheen) {
    tl.fromTo(
      sheen,
      { xPercent: -160, opacity: 0 },
      { xPercent: 220, opacity: 0.35, duration: 0.85, ease: "power2.inOut" },
      at + 0.1
    ).to(sheen, { opacity: 0, duration: 0.15 }, at + 0.8);
  }
}

/**
 * 4. Tactile 3D Button Press with Physical Plane Depression & Shockwave
 */
function tactilePress(tl, { card, button, ripple, at, tiltX = 4, tiltY = -3 }) {
  const cardEl = typeof card === "string" ? document.querySelector(card) : card;
  const btnEl = typeof button === "string" ? document.querySelector(button) : button;
  const ripEl = typeof ripple === "string" ? document.querySelector(ripple) : ripple;

  if (cardEl && btnEl) {
    tl.to(
      cardEl,
      {
        z: -36,
        scale: 0.975,
        duration: 0.11,
        ease: "power3.in"
      },
      at
    )
      .to(
        btnEl,
        {
          scale: 0.91,
          duration: 0.11,
          ease: "power3.in"
        },
        at
      )
      .to(
        [cardEl, btnEl],
        {
          z: 0,
          scale: 1,
          duration: 0.55,
          ease: "power3.out"
        },
        at + 0.11
      );
  }

  if (ripEl) {
    tl.fromTo(
      ripEl,
      { scale: 0.4, opacity: 0.95, borderWidth: "6px" },
      {
        scale: 2.9,
        opacity: 0,
        borderWidth: "1px",
        duration: 0.65,
        ease: "expo.out"
      },
      at + 0.09
    );
  }
}

/**
 * 5. Camera Punch, Continuous Drive & Rack Focus
 */
// Punch-in is softened to at most a 4% settle so it reads as emphasis, not a jolt.
function punch(tl, rigEl, at, intensity = 1.04) {
  const el = typeof rigEl === "string" ? document.querySelector(rigEl) : rigEl;
  if (!el) return;
  const from = 1 + Math.min(intensity - 1, 0.04);
  tl.fromTo(el, { scale: from }, { scale: 1, duration: 0.7, ease: "expo.out" }, at);
}

// Camera drift: linear 1.0 → ≤1.03 over the shot (CLAUDE.md §4). Larger legacy targets are clamped.
function drive(tl, rigEl, at, duration, opts = {}) {
  const { fromScale = 1, toScale = 1.03 } = opts;
  const el = typeof rigEl === "string" ? document.querySelector(rigEl) : rigEl;
  if (!el) return;
  tl.fromTo(el, { scale: fromScale }, { scale: Math.min(toScale, fromScale + 0.03), duration, ease: "none" }, at);
}

function rackFocus(tl, focusEls, blurEls, at, blurPx = 8) {
  if (focusEls) {
    tl.to(
      focusEls,
      { opacity: 1, z: "+=40", duration: 0.45, ease: "expo.out" },
      at
    );
  }
  if (blurEls) {
    tl.to(
      blurEls,
      { opacity: 0.42, duration: 0.45, ease: "expo.out" },
      at
    );
  }
}

/**
 * 6. Smooth Cross-Dissolve + Gentle Slide Between Scenes
 */
function portalZoom(tl, outRig, inRig, at) {
  if (outRig) {
    tl.to(
      outRig,
      {
        opacity: 0,
        y: -20,
        duration: 0.55,
        ease: "power2.inOut"
      },
      at
    );
  }
  if (inRig) {
    tl.fromTo(
      inRig,
      { y: 20, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.55, ease: "power2.out" },
      at + 0.15
    );
  }
}

/**
 * 7. Connected Architecture Stagger + SVG Pipeline Flow
 */
function animateConnectedArchitecture(tl, { cardsSelector, pathSelector, at = 0, stagger = 0.08, pulseSpeed = 1.4 }) {
  const cards = typeof cardsSelector === "string" ? document.querySelectorAll(cardsSelector) : cardsSelector;
  const path = typeof pathSelector === "string" ? document.querySelector(pathSelector) : pathSelector;

  if (cards && cards.length > 0) {
    tl.fromTo(
      cards,
      { opacity: 0, y: 32, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1, duration: 0.65, stagger, ease: "power3.out" },
      at
    );
  }

  if (path) {
    const length = path.getTotalLength ? path.getTotalLength() : 800;
    tl.fromTo(
      path,
      { strokeDasharray: length, strokeDashoffset: length, opacity: 0 },
      { strokeDashoffset: 0, opacity: 0.85, duration: pulseSpeed, ease: "power2.inOut" },
      at + 0.15
    );
  }
}

// Attach primitives to window
if (typeof window !== "undefined") {
  window.snap = snap;
  window.snapOut = snapOut;
  window.cardIn = cardIn;
  window.tactilePress = tactilePress;
  window.punch = punch;
  window.drive = drive;
  window.rackFocus = rackFocus;
  window.portalZoom = portalZoom;
  window.animateConnectedArchitecture = animateConnectedArchitecture;
  window.AnimPrimitives = { snap, snapOut, cardIn, tactilePress, punch, drive, rackFocus, portalZoom, animateConnectedArchitecture };
}

// =============================================================================
// MAIN TIMELINE ORCHESTRATION (15 Scenes Choreography)
// =============================================================================
(function () {
  const T = window.TL;
  const tl = gsap.timeline({ paused: true });

  // ---------------------------------------------------------------------------
  // VO-driven time warp. Everything below is authored in the original "source"
  // seconds (TL beats and literals). TL.warp() maps source → output seconds, as
  // generated by tools/retime.mjs from the measured VO. Every numeric tween
  // position is warped; short tweens keep their duration (same motion feel),
  // long holds/drifts (>= 1s) are stretched so they still end on their beat.
  // ---------------------------------------------------------------------------
  {
    // warpEdge keeps lead-ins to a cut / synced word in real time (exits end on the cut, fly-ins land on the word)
    const W = typeof T.warpEdge === "function" ? T.warpEdge : typeof T.warp === "function" ? T.warp : (t) => t;
    const LONG = 1.0;
    const warpVars = (vars, pos) => {
      if (!vars || typeof pos !== "number" || typeof vars.duration !== "number") return vars;
      if (vars.duration < LONG || vars.repeat) return vars;
      return { ...vars, duration: Math.max(0.01, W(pos + vars.duration) - W(pos)) };
    };
    const P = (pos) => (typeof pos === "number" ? W(pos) : pos);
    const raw = { to: tl.to.bind(tl), from: tl.from.bind(tl), fromTo: tl.fromTo.bind(tl), set: tl.set.bind(tl), call: tl.call.bind(tl) };
    tl.to = (t, v, pos) => raw.to(t, warpVars(v, pos), P(pos));
    tl.from = (t, v, pos) => raw.from(t, warpVars(v, pos), P(pos));
    tl.fromTo = (t, f, v, pos) => raw.fromTo(t, f, warpVars(v, pos), P(pos));
    tl.set = (t, v, pos) => raw.set(t, v, P(pos));
    tl.call = (fn, params, pos) => raw.call(fn, params, P(pos));
    tl.__raw = raw; // unwarped access for things already in output time (captions)
  }
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => Array.from(document.querySelectorAll(s));

  // Count helper
  function count(sel, t, to, dur = 1.0) {
    const el = typeof sel === "string" ? $(sel) : sel, o = { n: 0 };
    if (!el) return;
    tl.to(o, { n: to, duration: dur, ease: "power2.out", onUpdate: () => { el.textContent = Math.round(o.n).toLocaleString("en-US"); } }, t);
  }

  // Typewriter helper
  function type(sel, t, text, dur, caret) {
    const el = $(sel), o = { n: 0 };
    if (!el) return;
    tl.to(o, { n: text.length, duration: dur, ease: "none", onUpdate: () => { el.textContent = text.slice(0, Math.round(o.n)); } }, t);
    if (caret) tl.to(caret, { opacity: 0, duration: 0.42, repeat: Math.ceil(dur / 0.42) + 4, yoyo: true, ease: "steps(1)" }, t);
  }

  // Pulse blip helper
  function blip(sel, t) {
    tl.fromTo(sel, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(1.4)" }, t);
    tl.fromTo(`${sel} i`, { scale: 1, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.9, ease: "power2.out" }, t + 0.05);
  }

  // ---------------------------------------------------------------------------
  // Scene 1 (0.0s – 3.2s) · Clean Light Connected City Blueprint Hook
  // ---------------------------------------------------------------------------
  {
    const S = T.s1;
    tl.set(["#s1-top-pill", ".s1-node-card", "#s1-network-svg", ".s1-sonar-ring", "#s1-beat1-wrap", "#s1-cmd-pill"], { opacity: 0 }, 0);
    tl.set("#s1-beat2-wrap", { display: "none", opacity: 0 }, 0);
    tl.set("#rig-s1", { scale: 1, z: 0 }, 0);

    // Initial appearance of top telemetry pill and 4 connected barangay nodes
    tl.fromTo("#s1-top-pill", { opacity: 0, y: -24 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, S.start + 0.1);
    tl.fromTo(".s1-node-card", { opacity: 0, scale: 0.9, y: 16 }, { opacity: 1, scale: 1, y: 0, duration: 0.6, stagger: 0.08, ease: "power3.out" }, S.start + 0.15);
    tl.fromTo("#s1-network-svg line", { opacity: 0 }, { opacity: 1, duration: 0.8, stagger: 0.1, ease: "power2.out" }, S.start + 0.2);

    // Concentric flat 2D sonar rings expansion
    $$(".s1-sonar-ring").forEach((ring, i) => {
      tl.fromTo(ring, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 0.8, duration: 1.2, ease: "power2.out" }, S.start + 0.15 + i * 0.2);
    });

    // Beat 1 (0.2s – 1.4s): "Imagine a safer city."
    tl.set("#s1-beat1-wrap", { opacity: 1 }, S.b1);
    tl.fromTo("#s1-cmd-pill", { opacity: 0, y: -12, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "power3.out" }, S.b1 - 0.05);
    snap(tl, "#s1-w1", S.b1, { stagger: 0.06, y: 44, rotX: 0, blur: 10, ease: "expo.out" });
    snapOut(tl, "#s1-w1", S.b1End, { stagger: 0.03, y: -32, duration: 0.25 });
    tl.to("#s1-cmd-pill", { opacity: 0, y: -16, duration: 0.2 }, S.b1End + 0.05);
    tl.set("#s1-beat1-wrap", { display: "none" }, S.b1End + 0.25);

    // Beat 2 (1.6s – 3.0s): "...where help is always within reach."
    tl.set("#s1-beat2-wrap", { display: "flex", opacity: 1 }, S.b2 - 0.05);
    snap(tl, "#s1-w2", S.b2, { stagger: 0.05, y: 44, rotX: 0, blur: 10, ease: "expo.out" });
    tl.fromTo("#s1-telemetry-bar", { opacity: 0, y: 24, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "power3.out" }, S.b2 + 0.15);
    snapOut(tl, "#s1-w2", S.b2End, { stagger: 0.02, y: -28, duration: 0.2 });
    tl.to("#s1-telemetry-bar", { opacity: 0, y: -14, duration: 0.2 }, S.b2End);

    // Scene 1 Exit: Clean fade into black Scene 2
    tl.to(["#s1-top-pill", ".s1-node-card", "#s1-network-svg", ".s1-sonar-ring"], { opacity: 0, duration: 0.2 }, S.end - 0.2);
  }

  // ---------------------------------------------------------------------------
  // Scene 2 (3.2s – 5.4s) · The Inciting Incident
  // ---------------------------------------------------------------------------
  {
    const S = T.s2;
    tl.set("#s2-vignette", { opacity: 0 }, 0);
    // Gentle push-in entrance
    tl.fromTo(
      "#rig-s2",
      { scale: 0.94, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.5, ease: "expo.out" },
      S.start
    );
    // Word glide
    snap(tl, "#s2-kt", S.w1, { stagger: 0.08, rotX: -55, duration: 0.65 });

    // 4.1s: Pulse subtle crimson vignette around the edges
    tl.fromTo(
      "#s2-vignette",
      { opacity: 0 },
      { opacity: 0.75, duration: 0.35, yoyo: true, repeat: 1, ease: "power2.inOut" },
      4.1
    );
    snapOut(tl, "#s2-kt", S.end - 0.25, { stagger: 0.03 });
  }

  // ---------------------------------------------------------------------------
  // Scene 3 (5.4s – 8.0s) · Immediate Action
  // ---------------------------------------------------------------------------
  {
    const S = T.s3;
    snap(tl, "#s3-kt", S.w1, { stagger: 0.07, rotX: -50 });

    // 6.1s: "Make" ignites in crimson — one smooth swell instead of a jittery camera shake
    tl.to("#s3-make", { scale: 1.08, duration: 0.35, ease: "power3.out" }, 6.1);
    tl.to("#s3-make", { scale: 1, duration: 0.5, ease: "power2.inOut" }, 6.45);

    // 7.65s: Portal zoom straight through "Make" into Scene 4
  }

  // ---------------------------------------------------------------------------
  // Scene 4 (8.0s – 11.4s) · Connected System Architecture Flow
  // ---------------------------------------------------------------------------
  {
    const S = T.s4;
    const s4Start = 8.0;

    // 1. Initial State at 8.0s:
    // Header
    tl.set("#s4-header", { opacity: 0, y: -18 }, 0);

    // Card 1 starts sharp and lit; Cards 2..6 start blurred and dimmed
    tl.set("#s4-c1", {
      opacity: 1,
      scale: 1,
      borderColor: "rgba(220, 38, 38, 0.55)",
      boxShadow: "0 22px 50px -10px rgba(220, 38, 38, 0.22)"
    }, s4Start);

    tl.set(["#s4-c2", "#s4-c3", "#s4-c4", "#s4-c5", "#s4-c6"], {
      opacity: 0.26,
      scale: 0.95,
      borderColor: "#e2e8f0",
      boxShadow: "0 10px 24px -10px rgba(15, 23, 42, 0.04)"
    }, s4Start);

    tl.set(["#s4-b1 .flow-bridge-fill", "#s4-b2 .flow-bridge-fill", "#s4-b4 .flow-bridge-fill", "#s4-b5 .flow-bridge-fill"], {
      scaleX: 0
    }, s4Start);
    tl.set("#s4-b3 .flow-bridge-fill", { scaleY: 0 }, s4Start);

    // Header reveal
    tl.fromTo("#s4-header", { opacity: 0, y: -18 }, { opacity: 1, y: 0, duration: 0.5, ease: "power2.out" }, S.fly);

    // Fade in Scene 4 container and pulse Card 1 at 8.0s
    tl.fromTo("#s4", { opacity: 0 }, { opacity: 1, duration: 0.35, ease: "power2.out" }, s4Start);
    tl.fromTo("#s4-c1",
      { scale: 0.92, opacity: 0 },
      { scale: 1, opacity: 1, duration: 0.35, ease: "power3.out" },
      s4Start + 0.05
    );

    // Sequential chain calibrated so all 6 cards are fully revealed by 10.0s,
    // providing a generous 1.15s hold before transitioning out
    const chainSteps = [
      { bridge: "#s4-b1 .flow-bridge-fill", prop: "scaleX", nextCard: "#s4-c2", glow: "rgba(220, 38, 38, 0.22)", border: "rgba(220, 38, 38, 0.55)", at: 8.20 },
      { bridge: "#s4-b2 .flow-bridge-fill", prop: "scaleX", nextCard: "#s4-c3", glow: "rgba(34, 197, 94, 0.22)",  border: "rgba(34, 197, 94, 0.55)",  at: 8.55 },
      { bridge: "#s4-b3 .flow-bridge-fill", prop: "scaleY", nextCard: "#s4-c4", glow: "rgba(220, 38, 38, 0.22)", border: "rgba(220, 38, 38, 0.55)", at: 8.90 },
      { bridge: "#s4-b4 .flow-bridge-fill", prop: "scaleX", nextCard: "#s4-c5", glow: "rgba(245, 158, 11, 0.22)", border: "rgba(245, 158, 11, 0.55)", at: 9.25 },
      { bridge: "#s4-b5 .flow-bridge-fill", prop: "scaleX", nextCard: "#s4-c6", glow: "rgba(34, 197, 94, 0.22)",  border: "rgba(34, 197, 94, 0.55)",  at: 9.60 }
    ];

    chainSteps.forEach((step) => {
      // 1. Line flows across the gap (0.20s)
      tl.to(step.bridge, {
        [step.prop]: 1,
        duration: 0.20,
        ease: "power2.inOut"
      }, step.at);

      // 2. The moment the line reaches the next card (step.at + 0.18s), unblur and light up
      tl.to(step.nextCard, {
        opacity: 1,
        scale: 1,
        borderColor: step.border,
        boxShadow: `0 22px 50px -10px ${step.glow}`,
        duration: 0.25,
        ease: "power3.out"
      }, step.at + 0.18);
    });

    // Smooth 2D camera drift forward

    // 11.15s: Calm cross-dissolve & gentle glide into Scene 5
    tl.to(
      "#rig-s4",
      { scale: 1.06, opacity: 0, duration: S.end - 11.15, ease: "power2.in" },
      11.15
    );
  }

  // ---------------------------------------------------------------------------
  // Scene 5 (11.4s – 13.6s) · Core Creed ("Report. Track. Respond.")
  // ---------------------------------------------------------------------------
  {
    const S = T.s5;
    tl.set(["#s5-bg-light", "#s5-bg-dark", "#s5-bg-crimson", "#s5-wireframe", "#s5-nodes"], { opacity: 0 }, 0);
    tl.set(["#s5-a", "#s5-b", "#s5-c"], { opacity: 0 }, 0);

    // 11.40s: "Report." Clean Light Theme BG, Slate-900 text, wireframe zooming
    tl.set("#s5-bg-light", { opacity: 1 }, 11.4);
    tl.fromTo("#s5-wireframe", { opacity: 0, scale: 0.9 }, { opacity: 0.12, scale: 1.15, duration: 0.7, ease: "power1.out" }, 11.4);
    tl.set("#s5-a", { color: "#0f172a" }, 11.4);
    tl.fromTo("#s5-a", { opacity: 0, scale: 1.18 }, { opacity: 1, scale: 1, duration: 0.42, ease: "expo.out" }, 11.4);
    tl.to("#s5-a", { opacity: 0, scale: 0.8, duration: 0.18, ease: "expo.in" }, 12.05);

    // 12.10s: "Track." Hard cut to Dark Slate BG, pure white text, emerald green nodes glowing
    tl.set("#s5-bg-light", { opacity: 0 }, 12.1);
    tl.set("#s5-wireframe", { opacity: 0 }, 12.1);
    tl.set("#s5-bg-dark", { opacity: 1 }, 12.1);
    tl.fromTo("#s5-nodes", { opacity: 0, scale: 0.8 }, { opacity: 0.45, scale: 1.2, duration: 0.65, ease: "power2.out" }, 12.1);
    tl.set("#s5-b", { color: "#ffffff" }, 12.1);
    tl.fromTo("#s5-b", { opacity: 0, scale: 1.18 }, { opacity: 1, scale: 1, duration: 0.42, ease: "expo.out" }, 12.1);
    tl.to("#s5-b", { opacity: 0, scale: 0.8, duration: 0.18, ease: "expo.in" }, 12.75);

    // 12.80s: "Respond." Hard cut to Signature Crimson Red Gradient BG, pure white text with dark drop shadow, camera punch
    tl.set("#s5-bg-dark", { opacity: 0 }, 12.8);
    tl.set("#s5-nodes", { opacity: 0 }, 12.8);
    tl.set("#s5-bg-crimson", { opacity: 1 }, 12.8);
    tl.set("#s5-c", { color: "#ffffff" }, 12.8);
    tl.fromTo("#s5-c", { opacity: 0, scale: 1.18 }, { opacity: 1, scale: 1, duration: 0.42, ease: "expo.out" }, 12.8);
    tl.to("#rig-s5", { opacity: 0, duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 6 (13.6s – 19.9s) · SOS Gateway (Citizen Emergency)
  // ---------------------------------------------------------------------------
  {
    const S = T.s6;
    tl.set("#sos-wrap", { opacity: 1, scale: 1 }, S.start);
    tl.set("#sos-rows .sos-row", { opacity: 0, y: 14, x: 0 }, S.start);
    tl.set("#sos-prog", { strokeDashoffset: 603 }, S.start);

    // Headline snaps on left
    snap(tl, "#s6-kt", S.head, { stagger: 0.08, rotX: -45 });
    tl.fromTo("#s6-sub", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, S.head + 0.4);

    // Card in on right
    cardIn(tl, "#s6-card", S.card, {
      fromY: 32,
      driftDuration: 5.0
    });

    // 14.4s to 16.4s: Hold tension build
    const holdDur = 2.0;
    const holdStart = 14.4;
    tl.to("#sos-btn", { scale: 0.94, duration: 0.15, ease: "power2.in" }, holdStart);
    tl.to("#sos-prog", { strokeDashoffset: 0, duration: holdDur, ease: "none" }, holdStart);
    tl.set("#sos-hint", { color: "#dc2626" }, holdStart + 0.1);

    // Gentle micro-scale on card itself
    tl.to("#s6-card", { scale: 1.02, duration: holdDur, ease: "sine.inOut" }, holdStart);

    // Counter ticking 0.0s -> 3.0s
    const counterObj = { val: 0 };
    tl.to(counterObj, {
      val: 3.0,
      duration: holdDur,
      ease: "none",
      onUpdate: () => {
        const cEl = document.getElementById("sos-timer");
        if (cEl) cEl.textContent = `${counterObj.val.toFixed(1)}s`;
      }
    }, holdStart);

    // 16.35s: Fade out #sos-wrap, then stagger in #sos-rows
    tl.to("#sos-wrap", {
      opacity: 0,
      scale: 0.9,
      duration: 0.28,
      ease: "power2.inOut"
    }, 16.35);

    tl.fromTo(
      "#sos-rows .sos-row",
      { opacity: 0, y: 14, x: 0 },
      {
        opacity: 1,
        y: 0,
        x: 0,
        duration: 0.42,
        stagger: 0.14,
        ease: "power3.out"
      },
      16.45
    );

    snapOut(tl, "#s6-kt", S.end - 0.25);
    tl.to(["#s6-sub", "#s6-card"], { opacity: 0, duration: 0.25 }, S.end - 0.25);
  }

  // ---------------------------------------------------------------------------
  // Scene 7 (19.9s – 24.5s) · Community Report Mobile Flow
  // ---------------------------------------------------------------------------
  {
    const S = T.s7;
    tl.set("#s7-persp", { perspective: 2400 }, 0);
    tl.set("#s7-toast", { opacity: 0, y: 30, z: 0 }, 0);
    tl.set("#s7-cursor", { opacity: 0, scale: 0.6 }, 0);

    snap(tl, "#s7-kt", S.head, { rotX: -45 });
    tl.fromTo("#s7-sub", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, S.head + 0.4);

    // Floating phone mockup centered in right column
    cardIn(tl, "#s7-phone", S.phone, { fromY: 32 });

    // Touch cursor animation
    const cur = "#s7-cursor";
    tl.set(cur, { opacity: 1, x: 1300, y: 400 }, S.phone + 0.5);

    // Tap 1: Category "Theft / Snatching" at 20.8s
    tl.to(cur, { x: 1420, y: 340, duration: 0.45, ease: "power2.out" }, 20.35);
    tl.to(cur, { scale: 0.75, duration: 0.08, yoyo: true, repeat: 1 }, 20.8);
    tactilePress(tl, { card: "#s7-phone", button: "#s7-cat", at: 20.8 });
    tl.to("#s7-cat", { backgroundColor: "#fff1f2", borderColor: "#dc2626", color: "#dc2626", z: 48, duration: 0.25 }, 20.85);

    // Tap 2: Role "Witness" at 21.7s
    tl.to(cur, { x: 1380, y: 490, duration: 0.55, ease: "power2.out" }, 21.15);
    tl.to("#s7-st2", { backgroundColor: "#dc2626", duration: 0.2 }, 21.5);
    tl.to(cur, { scale: 0.75, duration: 0.08, yoyo: true, repeat: 1 }, 21.7);
    tactilePress(tl, { card: "#s7-phone", button: "#s7-role", at: 21.7 });
    tl.to("#s7-role", { backgroundColor: "#fff1f2", borderColor: "#dc2626", z: 48, duration: 0.25 }, 21.75);

    // Tap 3: Evidence Photo attached at 22.6s
    tl.to(cur, { x: 1380, y: 580, duration: 0.55, ease: "power2.out" }, 22.05);
    tl.to("#s7-st3", { backgroundColor: "#dc2626", duration: 0.2 }, 22.4);
    tl.to(cur, { scale: 0.75, duration: 0.08, yoyo: true, repeat: 1 }, 22.6);
    tactilePress(tl, { card: "#s7-phone", button: "#s7-photo", at: 22.6 });
    tl.fromTo("#s7-photo .ok", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.4)" }, 22.65);
    tl.to("#s7-photo", { borderColor: "#22c55e", z: 48, duration: 0.25 }, 22.65);

    // Submit at 23.4s -> pop toast TR-4821 at translateZ(80px)
    tl.to(cur, { x: 1380, y: 880, duration: 0.5, ease: "power2.out" }, 22.9);
    tl.to(cur, { scale: 0.75, duration: 0.08, yoyo: true, repeat: 1 }, 23.4);
    tactilePress(tl, { card: "#s7-phone", button: "#s7-btn", at: 23.4 });
    tl.to("#s7-btn", { opacity: 0, y: 20, duration: 0.2 }, 23.45);
    tl.fromTo(
      "#s7-toast",
      { opacity: 0, y: 30, z: 0 },
      { opacity: 1, y: 0, z: 80, duration: 0.45, ease: "expo.out" },
      23.5
    );
    tl.to(cur, { opacity: 0, duration: 0.3 }, 23.6);

    snapOut(tl, "#s7-kt", S.end - 0.22);
    tl.to("#s7-sub", { opacity: 0, duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 8 (24.5s – 28.6s) · Real-Time Tracking Pipeline
  // ---------------------------------------------------------------------------
  {
    const S = T.s8;
    snap(tl, "#s8-kt", S.head, { rotX: -45 });
    tl.fromTo("#s8-sub", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, S.head + 0.4);

    // Match Cut: Card in cleanly centered (camera at scale 1.0)
    cardIn(tl, "#s8-card", S.card);

    // Light up stages with emerald checkmarks
    const lightStage = (id, t, isLive = false) => {
      tl.to(id, {
        backgroundColor: isLive ? "#fff1f2" : "#f0fdf4",
        borderColor: isLive ? "#fecaca" : "#bbf7d0",
        color: isLive ? "#b91c1c" : "#0f172a",
        duration: 0.25
      }, t);
      tl.to(`${id} .chk`, {
        backgroundColor: isLive ? "#dc2626" : "#22c55e",
        borderColor: isLive ? "#dc2626" : "#22c55e",
        duration: 0.25
      }, t);
      tl.fromTo(`${id} .chk svg`, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.4)" }, t + 0.05);
      tl.to(`${id} .t`, { color: isLive ? "#dc2626" : "#047857", duration: 0.25 }, t);
      tl.fromTo(id, { scale: 1 }, { scale: 1.04, z: 32, duration: 0.15, yoyo: true, repeat: 1 }, t);
    };

    lightStage("#s8-p1", S.p1);
    lightStage("#s8-p2", S.p2);
    lightStage("#s8-p3", S.p3);
    lightStage("#s8-p4", S.p4, true);
    lightStage("#s8-p5", S.p5);

    snapOut(tl, "#s8-kt", S.end - 0.22);
    tl.to(["#s8-sub", "#s8-card"], { opacity: 0, duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 9 (28.6s – 32.9s) · Police Dispatch Command Center
  // ---------------------------------------------------------------------------
  {
    const S = T.s9;
    snap(tl, "#s9-kt", S.head, { rotX: -45 });
    tl.fromTo("#s9-sub", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, S.head + 0.4);

    // Command Center card in centered with zero 3D tilt
    cardIn(tl, "#s9-card", S.card);

    tl.set("#s9-new", { opacity: 0, y: -24 }, 0);
    tl.set("#s9-queue", { filter: "none", opacity: 1 }, 0);

    // Stats counter animation
    $$("#s9 .stat").forEach((st, i) => {
      tl.fromTo(st, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "power3.out" }, S.stats + i * 0.1);
    });
    $$("#s9 .s9-num").forEach((el, i) => count(el, S.stats + i * 0.12, +el.dataset.to, 0.9));

    // Live clock ticking
    ["18:42:08 PHT", "18:42:09 PHT", "18:42:10 PHT"].forEach((s, i) => {
      tl.set("#s9-clock", { textContent: s }, S.card + 0.8 + i);
    });

    // 30.3s: Incoming triage row TR-4821 slides down smoothly
    tl.fromTo(
      "#s9-new",
      { opacity: 0, y: -24 },
      { opacity: 1, y: 0, duration: 0.48, ease: "power3.out" },
      30.3
    );
    // Shockwave pulse
    tl.fromTo(
      "#s9-new",
      { boxShadow: "0 0 0 2px rgba(220, 38, 38, 0.9), 0 0 0 0 rgba(220, 38, 38, 0)" },
      { boxShadow: "0 0 0 2px rgba(220, 38, 38, 0.9), 0 0 0 24px rgba(220, 38, 38, 0)", duration: 0.8, ease: "power2.out" },
      30.3 + 0.1
    );
    tl.set("#s9 .stat.hot .v", { textContent: "4" }, 30.3 + 0.1);

    snapOut(tl, "#s9-kt", S.end - 0.22);
    tl.to(["#s9-sub", "#s9-card"], { opacity: 0, duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 10 (source 32.9s – 44.4s) · 3-Way Real-Time Dispatch Bridge
  // ---------------------------------------------------------------------------
  {
    const S = T.s10;
    const t10 = S.start; // 32.9s

    // 0. INITIAL RESET AT t10 (0.0s relative)
    tl.set("#s10-col-1", { opacity: 1, scale: 1 }, t10);
    tl.set(["#s10-col-2", "#s10-col-3"], { opacity: 0.25, scale: 0.96 }, t10);
    tl.set("#s10-card-1", { className: "s10-card s10-citizen-card" }, t10);
    tl.set("#s10-card-2", { className: "s10-card s10-dark-card" }, t10);
    tl.set("#s10-card-3", { className: "s10-card s10-dark-card" }, t10);
    tl.set("#s10-c1-panel", { className: "s10-c1-status-panel" }, t10);
    tl.set("#s10-c1-status-txt", { textContent: "LOCKING GPS TELEMETRY..." }, t10);
    tl.set("#s10-c1-hero", { textContent: "Emergency SOS Packet" }, t10);
    tl.set("#s10-c1-sub", { textContent: "Direct telemetry link to Valenzuela PNP Command & nearest precinct." }, t10);
    tl.set("#s10-c1-btn", { className: "s10-c1-btn", scale: 1 }, t10);
    tl.set("#s10-c1-btn-txt", { textContent: "🚨 Send SOS / Submit Report" }, t10);
    tl.set("#s10-c1-route-prog", { width: "0%" }, t10);
    tl.set(["#s10-beam-1", "#s10-beam-2", "#s10-beam-3"], { scaleX: 0 }, t10);
    tl.set(["#s10-stem-r", "#s10-stem-l"], { scaleY: 0 }, t10);
    tl.set("#s10-ai-bar", { width: "0%" }, t10);
    tl.set("#s10-ai-badge", { textContent: "🧠 AI SCANNING REPORT..." }, t10);
    tl.set("#s10-ai-score", { textContent: "0% CONFIDENCE" }, t10);
    tl.set(["#s10-chk-1", "#s10-chk-2", "#s10-chk-3"], { opacity: 0.18, x: -8 }, t10);
    tl.set("#s10-hq-btn", { className: "s10-hq-btn", scale: 1 }, t10);
    tl.set("#s10-hq-btn-txt", { textContent: "[Assign Substation: Mapulang Lupa ➔]" }, t10);
    tl.set("#s10-sub-btn", { scale: 1 }, t10);
    tl.set("#s10-sub-btn-txt", { textContent: "[Confirm Deployment / Respond Now]" }, t10);
    tl.set("#s10-unit-badge", { className: "s10-unit-badge", textContent: "STANDBY" }, t10);
    tl.set("#s10-return-pill", { opacity: 0, scale: 0.9 }, t10);
    tl.set("#s10-bench-box", { className: "s10-benchmark-box" }, t10);
    tl.set("#s10-bench-prefix", { textContent: "ELAPSED TIME:" }, t10);
    tl.set("#s10-bench-timer", { textContent: "0.00s" }, t10);
    tl.set("#s10-title .word", { opacity: 0, y: 18 }, t10);
    tl.set("#s10-cursor", { x: 335, y: 705, opacity: 0, scale: 1 }, t10);

    tl.fromTo("#s10", { opacity: 0 }, { opacity: 1, duration: 0.4, ease: "power2.out" }, t10);

    // Master Benchmark Clock ticks 0.00s -> 2.84s across the workflow
    const benchObj = { t: 0 };
    const benchEl = document.getElementById("s10-bench-timer");
    tl.to(benchObj, {
      t: 2.84,
      duration: 7.8,
      ease: "none",
      onUpdate: () => {
        if (benchEl) benchEl.textContent = `${benchObj.t.toFixed(2)}s`;
      }
    }, t10 + 0.6);

    // -------------------------------------------------------------------------
    // BEAT 1 (0.0s – 1.6s): CITIZEN MARIA SUBMITS SOS REPORT
    // -------------------------------------------------------------------------
    tl.to("#s10-cursor", { opacity: 1, x: 335, y: 705, duration: 0.4, ease: "power2.out" }, t10 + 0.2)
      .to(["#s10-c1-btn", "#s10-cursor"], { scale: 0.93, duration: 0.12, ease: "power2.in" }, t10 + 0.65)
      .to(["#s10-c1-btn", "#s10-cursor"], { scale: 1, duration: 0.3, ease: "power3.out" }, t10 + 0.77)
      .set("#s10-card-1", { className: "s10-card s10-citizen-card is-amber" }, t10 + 0.80)
      .set("#s10-c1-panel", { className: "s10-c1-status-panel amber-mode" }, t10 + 0.80)
      .set("#s10-c1-status-txt", { textContent: "TRANSMITTING DISTRESS PACKET..." }, t10 + 0.80)
      .set("#s10-c1-hero", { textContent: "SOS Packet Sent (TR-4821)" }, t10 + 0.80)
      .set("#s10-c1-btn", { className: "s10-c1-btn amber-btn" }, t10 + 0.80)
      .set("#s10-c1-btn-txt", { textContent: "📡 Transmitting Distress Packet..." }, t10 + 0.80);

    // -------------------------------------------------------------------------
    // BEAT 2 (1.6s – 5.6s): UPLINK + 2.4s AI CREDIBILITY ANALYSIS + HQ ASSIGN
    // -------------------------------------------------------------------------
    // Uplink beam travels across Bridge 1 (1.60s – 1.95s)
    tl.to("#s10-beam-1", { scaleX: 1, duration: 0.35, ease: "power2.inOut" }, t10 + 1.60);

    // Column 2 (HQ) unblurs at 1.95s
    tl.to("#s10-col-2", {
      opacity: 1,
      scale: 1,
      duration: 0.4,
      ease: "power3.out"
    }, t10 + 1.95)
    .set("#s10-card-2", { className: "s10-card s10-dark-card is-strobing" }, t10 + 1.95);

    // 2.4-Second AI Analysis: Ticks 0% -> 87% while lighting up 3 verification checks
    const aiScoreObj = { v: 0 };
    const aiScoreEl = document.getElementById("s10-ai-score");
    tl.to(aiScoreObj, {
      v: 87,
      duration: 2.3,
      ease: "power2.inOut",
      onUpdate: () => {
        if (aiScoreEl) aiScoreEl.textContent = `${Math.round(aiScoreObj.v)}% CONFIDENCE`;
      }
    }, t10 + 2.10);

    tl.to("#s10-ai-bar", { width: "87%", duration: 2.3, ease: "power2.inOut" }, t10 + 2.10)
      .to("#s10-chk-1", { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, t10 + 2.40)
      .to("#s10-chk-2", { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, t10 + 3.10)
      .to("#s10-chk-3", { opacity: 1, x: 0, duration: 0.35, ease: "power2.out" }, t10 + 3.80)
      .set("#s10-ai-badge", { textContent: "🧠 AI VERIFIED · LEGIT" }, t10 + 4.35)
      .set("#s10-ai-score", { textContent: "87% CONFIDENCE · REAL RESIDENT" }, t10 + 4.35);

    // HQ Dispatcher cursor glides to "[Assign Substation: Mapulang Lupa ➔]" & clicks
    tl.to("#s10-cursor", { x: 960, y: 705, duration: 0.5, ease: "power3.inOut" }, t10 + 4.50)
      .to(["#s10-hq-btn", "#s10-cursor"], { scale: 0.93, duration: 0.12, ease: "power2.in" }, t10 + 5.10)
      .to(["#s10-hq-btn", "#s10-cursor"], { scale: 1, duration: 0.28, ease: "power3.out" }, t10 + 5.22)
      .set("#s10-hq-btn", { className: "s10-hq-btn assigned" }, t10 + 5.24)
      .set("#s10-hq-btn-txt", { textContent: "✓ Assigned to Mapulang Lupa Sub-Station" }, t10 + 5.24);

    // -------------------------------------------------------------------------
    // BEAT 3 (5.6s – 7.6s): RELAY BEAM + SUB-STATION DEPLOYMENT
    // -------------------------------------------------------------------------
    tl.to("#s10-beam-2", { scaleX: 1, duration: 0.35, ease: "power2.inOut" }, t10 + 5.60)
      .to("#s10-col-3", { opacity: 1, scale: 1, duration: 0.4, ease: "power3.out" }, t10 + 5.95)
      .set("#s10-card-3", { className: "s10-card s10-dark-card is-alerted" }, t10 + 5.95)
      .to("#s10-cursor", { x: 1565, y: 705, duration: 0.5, ease: "power3.inOut" }, t10 + 6.30)
      .to(["#s10-sub-btn", "#s10-cursor"], { scale: 0.93, duration: 0.12, ease: "power2.in" }, t10 + 6.95)
      .to(["#s10-sub-btn", "#s10-cursor"], { scale: 1, duration: 0.28, ease: "power3.out" }, t10 + 7.07)
      .set("#s10-card-3", { className: "s10-card s10-dark-card is-deployed" }, t10 + 7.10)
      .set("#s10-unit-badge", { className: "s10-unit-badge deployed", textContent: "DEPLOYED · EN ROUTE" }, t10 + 7.10)
      .set("#s10-sub-btn-txt", { textContent: "✓ Patrol Unit MPL-04 Deployed" }, t10 + 7.10)
      .to("#s10-cursor", { opacity: 0, duration: 0.25 }, t10 + 7.35);

    // -------------------------------------------------------------------------
    // BEAT 4 (7.6s – 10.0s): SLOW BOTTOM RETURN CONDUIT -> MARIA EMERALD + HEADLINE
    // -------------------------------------------------------------------------
    // 1. Drop down stem from Col 3 (0.18s), travel across bottom track (0.65s), rise up into Col 1 (0.18s)
    tl.to("#s10-stem-r", { scaleY: 1, duration: 0.18, ease: "power1.in" }, t10 + 7.55)
      .to("#s10-beam-3", { scaleX: 1, duration: 0.65, ease: "power1.inOut" }, t10 + 7.73)
      .to("#s10-return-pill", { opacity: 1, scale: 1, duration: 0.35, ease: "power3.out" }, t10 + 7.90)
      .to("#s10-stem-l", { scaleY: 1, duration: 0.18, ease: "power1.out" }, t10 + 8.38);

    // 2. Exact moment return line reaches Col 1 (8.55s): Maria's Card turns Emerald + Bottom Headline Snaps In!
    const confirmAt = t10 + 8.55;
    tl.set("#s10-card-1", { className: "s10-card s10-citizen-card is-emerald" }, confirmAt)
      .set("#s10-c1-panel", { className: "s10-c1-status-panel emerald-mode" }, confirmAt)
      .set("#s10-c1-status-txt", { textContent: "✓ PATROL UNIT MPL-04 DISPATCHED" }, confirmAt)
      .set("#s10-c1-hero", { textContent: "Help is on the way." }, confirmAt)
      .set("#s10-c1-sub", { textContent: "Unit MPL-04 Dispatched from Mapulang Lupa Sub-Station · 5 min ETA." }, confirmAt)
      .set("#s10-c1-btn", { className: "s10-c1-btn emerald-btn" }, confirmAt)
      .set("#s10-c1-btn-txt", { textContent: "✓ Unit MPL-04 Dispatched · 5 min ETA" }, confirmAt)
      .fromTo("#s10-card-1", { scale: 1.03 }, { scale: 1, duration: 0.4, ease: "power3.out" }, confirmAt)
      .to("#s10-c1-route-prog", { width: "86%", duration: 0.85, ease: "power2.out" }, confirmAt + 0.05)
      .set("#s10-bench-box", { className: "s10-benchmark-box is-locked" }, confirmAt)
      .set("#s10-bench-prefix", { textContent: "TOTAL ROUND-TRIP:" }, confirmAt)
      .set("#s10-bench-timer", { textContent: "2.84 SECONDS" }, confirmAt)
      .fromTo("#s10-bench-box", { scale: 1.06 }, { scale: 1, duration: 0.4, ease: "power3.out" }, confirmAt);

    // Snap in bottom headline ("AI verifies in seconds. One click dispatches help.") at t10 + 8.15s
    // Finishes animating at t10 + 8.85s and holds until t10 + 11.50s (2.65s of pure reading time!)
    tl.to("#s10-title .word", {
      opacity: 1,
      y: 0,
      duration: 0.4,
      stagger: 0.04,
      ease: "power3.out"
    }, t10 + 8.15);

    // Clean exit
    tl.to(["#rig-s10", "#s10"], { opacity: 0, duration: 0.25 }, S.end - 0.25);
  }

  // ---------------------------------------------------------------------------
  // Scene 11 (source 44.4s – 48.6s) · Flat 2D Hotspot Radar & Predictive Analytics
  // ---------------------------------------------------------------------------
  {
    const S = T.s11;
    tl.set(["#s11-radar", "#s11-hot"], { opacity: 0 }, 0);
    tl.set("#s11-radar", { rotationZ: 0, scale: 1 }, 0);
    tl.set(["#s11-bar1", "#s11-bar2"], { width: "0%" }, 0);

    // Kinetic typography snaps in flat 2D
    snap(tl, "#s11-kt", S.head + 0.15, { rotX: 0, y: 36 });
    tl.fromTo("#s11-sub", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, S.head + 0.45);

    // Flat 2D radar appearance (zero 3D rotationX!)
    tl.fromTo(
      "#s11-radar",
      { scale: 0.85, opacity: 0 },
      { scale: 1.0, opacity: 1, duration: 0.8, ease: "power3.out" },
      S.radar
    );

    // Counter-rotating degree ring
    tl.fromTo("#s11-deg-ring", { rotation: 0 }, { rotation: -180, duration: S.end - S.radar, ease: "none" }, S.radar);

    // Radar beam 360-degree sweep
    tl.fromTo("#s11-beam", { rotate: 0 }, { rotate: 720, duration: S.end - S.radar, ease: "none" }, S.radar);

    // Blips pulse sequentially as beam sweeps across
    ["#s11-b1", "#s11-b2", "#s11-b3", "#s11-b4", "#s11-b5", "#s11-b6"].forEach((id, i) => {
      blip(id, S.blips + i * 0.15);
    });

    // Hotspot leaderboard card enters flat 2D
    tl.fromTo(
      "#s11-hot",
      { opacity: 0, y: 40, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" },
      S.card
    );
    const sheen = document.querySelector("#s11-hot .light-sheen");
    if (sheen) {
      tl.fromTo(sheen, { xPercent: -130 }, { xPercent: 130, duration: 1.0, ease: "power2.inOut" }, S.card + 0.1);
    }

    // Hotspot severity bars fill + counts climb
    tl.to("#s11-bar1", { width: "88%", duration: 0.9, ease: "power2.out" }, S.card + 0.2);
    tl.to("#s11-bar2", { width: "54%", duration: 0.9, ease: "power2.out" }, S.card + 0.3);
    count("#s11-count1", S.card + 0.2, 31, 0.9);
    count("#s11-count2", S.card + 0.3, 18, 0.9);

    snapOut(tl, "#s11-kt", S.end - 0.22);
    tl.to(["#s11-sub", "#s11-hot", "#s11-radar"], { opacity: 0, duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 12 (source 48.6s – 57.0s) · AI Decision Support & Interactive RAG Flow
  // ---------------------------------------------------------------------------
  {
    const S = T.s12;
    const t12 = S.start; // 48.6s

    // 0. Initial resets
    tl.set(["#s12-pipeline", "#s12-card"], { opacity: 0 }, t12);
    tl.set(["#s12-cfill-1", "#s12-cfill-2"], { width: "0%" }, t12);
    tl.set(["#s12-node-1", "#s12-node-2", "#s12-node-3"], { opacity: 0.55, scale: 0.95 }, t12);
    tl.set("#s12-launcher", { display: "flex", opacity: 1, height: "auto", padding: "20px 22px", margin: 0 }, t12);
    tl.set("#s12-gen-btn", { scale: 1, opacity: 1, display: "flex" }, t12);
    tl.set("#s12-launcher-status", { textContent: "STANDBY", color: "#64748b" }, t12);
    tl.set("#s12-loader-box", { display: "none", opacity: 0 }, t12);
    tl.set("#s12-loader-bar", { width: "0%" }, t12);
    tl.set("#s12-loader-pct", { textContent: "0%" }, t12);
    tl.set("#s12-action-list", { display: "none", opacity: 0 }, t12);
    tl.set([".rag-action-item", "#s12-guard span", "#s12-guard .rag-badge"], { opacity: 0 }, t12);
    tl.set("#s12-cursor", { x: 1367, y: 850, opacity: 0, scale: 1 }, t12);

    const approveBtn = document.querySelector("#s12-approve-btn") || document.querySelector("#s12-approve-pill");
    if (approveBtn) {
      tl.set(approveBtn, { backgroundColor: "#dcfce7", color: "#15803d", textContent: "✓ Approved · PO2 Reyes", scale: 1 }, t12);
    }

    // Headline snaps flat 2D
    snap(tl, "#s12-kt", S.head + 0.15, { rotX: 0, y: 36 });
    tl.fromTo("#s12-sub", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, S.head + 0.4);

    // Card entrance
    tl.fromTo(
      "#s12-card",
      { opacity: 0, y: 36, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" },
      S.card
    );
    tl.fromTo("#s12-pipeline", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, S.card);

    const sheen = document.querySelector("#s12-card .light-sheen");
    if (sheen) {
      tl.fromTo(sheen, { xPercent: -130 }, { xPercent: 130, duration: 1.0, ease: "power2.inOut" }, S.card + 0.1);
    }

    // 1. Simulation cursor enters and glides to dead-center of "Generate AI Decision Support" button
    tl.to("#s12-cursor", { opacity: 1, x: 1367, y: 720, duration: 0.60, ease: "power3.out" }, t12 + 0.85)
      .to(["#s12-gen-btn", "#s12-cursor"], { scale: 0.93, duration: 0.10, ease: "power2.in" }, t12 + 1.40)
      .to(["#s12-gen-btn", "#s12-cursor"], { scale: 1, duration: 0.15, ease: "power3.out" }, t12 + 1.50);

    // 2. Click triggers AI Loading & RAG Pipeline flow (t12 + 1.50s -> 50.10s)
    const loadT = t12 + 1.50;
    tl.set("#s12-gen-btn", { display: "none" }, loadT)
      .set("#s12-launcher-status", { textContent: "SYNTHESIZING...", color: "#0369a1" }, loadT)
      .set("#s12-loader-box", { display: "flex", opacity: 1 }, loadT);

    // Live counter 0% -> 100% over 2.0s
    const loadPctObj = { p: 0 };
    const loadPctEl = document.getElementById("s12-loader-pct");
    tl.to(loadPctObj, {
      p: 100,
      duration: 2.0,
      ease: "power1.inOut",
      onUpdate: () => {
        if (loadPctEl) loadPctEl.textContent = `${Math.round(loadPctObj.p)}%`;
      }
    }, loadT);
    tl.to("#s12-loader-bar", { width: "100%", duration: 2.0, ease: "power1.inOut" }, loadT);

    // Synchronized 3-Node RAG Pipeline Beam Sweep above the card (smooth over 2.0s)
    tl.to("#s12-node-1", { scale: 1.06, opacity: 1, duration: 0.35, ease: "power3.out" }, loadT);
    tl.to("#s12-cfill-1", { width: "100%", duration: 0.70, ease: "power2.inOut" }, loadT + 0.20);
    tl.to("#s12-node-2", { scale: 1.06, opacity: 1, duration: 0.35, ease: "power3.out" }, loadT + 0.85);
    tl.to("#s12-cfill-2", { width: "100%", duration: 0.70, ease: "power2.inOut" }, loadT + 1.05);
    tl.to("#s12-node-3", { scale: 1.06, opacity: 1, duration: 0.35, ease: "power3.out" }, loadT + 1.70);

    // 3. Loading completes -> launcher fades out and action plan rows stream in (t12 + 3.70s = 52.30s)
    const ansT = t12 + 3.70;
    tl.to("#s12-launcher", { opacity: 0, height: 0, padding: 0, margin: 0, duration: 0.25, ease: "power2.inOut" }, ansT)
      .set("#s12-launcher", { display: "none" }, ansT + 0.25)
      .set("#s12-action-list", { display: "flex", opacity: 1 }, ansT + 0.08);

    // Stream tactical rows sequentially
    tl.fromTo("#s12-row-1", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out" }, ansT + 0.10);
    tl.fromTo("#s12-row-2", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out" }, ansT + 0.50);
    tl.fromTo("#s12-row-3", { opacity: 0, x: -24 }, { opacity: 1, x: 0, duration: 0.45, ease: "power2.out" }, ansT + 0.90);

    // Guardrail badges pop in
    $$("#s12-guard span, #s12-guard .rag-badge").forEach((g, i) => {
      tl.fromTo(g, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4, ease: "power3.out" }, ansT + 1.30 + i * 0.1);
    });

    // 4. Cursor glides down to dead-center of Approve button and clicks it (t12 + 5.40s = 54.00s)
    tl.to("#s12-cursor", { x: 1602, y: 813, opacity: 1, duration: 0.60, ease: "power3.inOut" }, ansT + 1.70);

    const approveAt = ansT + 2.30; // 54.60s
    if (approveBtn) {
      tl.to(["#s12-approve-pill", "#s12-cursor"], { scale: 0.92, duration: 0.10, ease: "power2.in" }, approveAt)
        .to("#s12-approve-pill", {
          scale: 1,
          backgroundColor: "#22c55e",
          color: "#052e16",
          textContent: "Approved · Patrol Dispatched",
          duration: 0.25,
          ease: "power3.out"
        }, approveAt + 0.10)
        .to("#s12-cursor", { scale: 1, opacity: 0, duration: 0.3 }, approveAt + 0.10);
    }

    // Clean exit holding still until S.end
    snapOut(tl, "#s12-kt", S.end - 0.22);
    tl.to(["#s12-sub", "#s12-card", "#s12-pipeline"], { opacity: 0, duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 13 (source 57.0s – 61.2s) · Valenzuela Community Storm
  // ---------------------------------------------------------------------------
  {
    const S = T.s13;
    // spoken order: "One connected system" (#s13-w6) sits between "Valenzuela police" and "Greater transparency"
    const phrases = ["#s13-w0", "#s13-w1", "#s13-w2", "#s13-w6", "#s13-w3", "#s13-w4", "#s13-w5"];
    // Gentle stepped push-in (1.00 → 1.03) with no roll: keeps the bottom tag line inside the safe area
    // and clear of the caption pill, and stops the headline from jolting.
    const pushes = [1.0, 1.005, 1.01, 1.015, 1.02, 1.025, 1.03];

    phrases.forEach((id, i) => {
      const t = S.w[i];
      const nextT = S.w[i + 1] ?? S.end;
      snap(tl, id, t, { stagger: 0.04, duration: 0.55 });
      tl.to("#rig-s13", { scale: pushes[i], duration: 0.6, ease: "power3.out" }, t);
      if (i < phrases.length - 1) snapOut(tl, id, nextT - 0.26); // fully gone before the next phrase lands (no overlap)
    });

    tl.fromTo("#s13-t", { opacity: 0, letterSpacing: "0.5em" }, { opacity: 1, letterSpacing: "0.2em", duration: 1.2, ease: "power3.out" }, S.w[0] + 0.3);
    tl.to("#rig-s13", { opacity: 0, duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 14 (source 61.2s – 65.4s) · Blurred Ecosystem Convergence & Hero Copy
  // ---------------------------------------------------------------------------
  {
    const S = T.s14;
    tl.set("#s14-bg-net", { opacity: 0 }, 0);
    tl.set(["#s14-top-pill", "#s14-node-bar"], { opacity: 0, y: 20 }, 0);
    tl.set("#s14-pulse-path", { strokeDashoffset: 1200 }, 0);

    // Background blurred network fades in with high depth-of-field
    tl.fromTo(
      "#s14-bg-net",
      { opacity: 0, scale: 0.94 },
      { opacity: 0.55, scale: 1, duration: 0.9, ease: "power2.out" },
      S.fly
    );

    // Flow pulse animates through blurred ecosystem line
    const s14Path = document.getElementById("s14-pulse-path");
    if (s14Path) {
      const len = s14Path.getTotalLength ? s14Path.getTotalLength() : 1200;
      tl.fromTo(
        s14Path,
        { strokeDasharray: len, strokeDashoffset: len },
        { strokeDashoffset: 0, duration: 2.4, ease: "power1.inOut" },
        S.fly + 0.1
      );
    }

    // Foreground top pill
    tl.fromTo("#s14-top-pill", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.5, ease: "power3.out" }, S.fly + 0.2);

    // Foreground hero typography snap (flat 2D, high contrast)
    snap(tl, "#s14-kt", S.title, { rotX: 0, y: 44, stagger: 0.06 });

    // Bottom community nodes bar reveals
    tl.fromTo(
      "#s14-node-bar",
      { opacity: 0, y: 30, scale: 0.94 },
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "power3.out" },
      S.title + 0.35
    );

    // Camera micro-drive

    // 65.0s: Clean condensation into Scene 15's single flatline
    tl.to(
      ["#s14-bg-net", "#s14-top-pill", "#s14-node-bar", "#s14-kt"],
      { opacity: 0, scale: 0.96, duration: 0.38, ease: "expo.in" },
      65.0
    );
  }

  // ---------------------------------------------------------------------------
  // Scene 15 (source 65.4s – 72.0s) · Logo reveal: heartbeat → collapse → 3 shards assemble → lock → wordmark
  //   Shards land on the spoken "Report." / "Track." / "Respond.", the lock on "ThreatTrack!" (word-synced by retime.mjs).
  // ---------------------------------------------------------------------------
  {
    const S = T.s15;
    const shards = { l: "#s15-shard-l", r: "#s15-shard-r", t: "#s15-shard-t" };
    tl.set("#s15-line", { strokeDasharray: 2200, strokeDashoffset: 2200 }, 0);
    tl.set(".flat", { scaleX: 1, scaleY: 1, opacity: 1, transformOrigin: "50% 50%" }, 0);
    tl.set(["#s15-word", "#s15-tag", "#s15-pill", "#s15-png", "#s15-spark", "#s15-ring", "#s15-flash", "#s15-edges"], { opacity: 0 }, 0);
    tl.set(["#s15-logo", ".s15-shards"], { opacity: 1 }, 0);
    tl.set(Object.values(shards), { opacity: 0, transformOrigin: "50% 50%" }, 0);
    tl.set("#s15-word .line", { clipPath: "inset(0% 100% 0% 0%)" }, 0);

    // 1. Heartbeat build: the line draws, then three quickening beats
    tl.to("#s15-line", { strokeDashoffset: 0, duration: 0.55, ease: "power2.out" }, S.line);
    tl.fromTo("#s15-glow", { scale: 0.3, opacity: 0 }, { scale: 0.9, opacity: 0.7, duration: 0.5, ease: "power2.out" }, S.line + 0.1);
    S.pulse.forEach((t, i) => {
      const amp = 1.5 + i * 0.6;
      tl.fromTo(".flat", { scaleY: 1 }, { scaleY: amp, duration: 0.07, yoyo: true, repeat: 1, ease: "power2.out" }, t);
      tl.fromTo("#s15-glow", { scale: 0.9 + i * 0.1 }, { scale: 1.15 + i * 0.12, duration: 0.12, yoyo: true, repeat: 1, ease: "power2.out" }, t);
    });

    // 2. Collapse: the line snaps into a single bright point, then a white flash
    tl.to(".flat", { scaleX: 0, duration: 0.2, ease: "expo.in" }, S.collapse - 0.05);
    tl.fromTo("#s15-spark", { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1.8, duration: 0.12, ease: "expo.out" }, S.collapse - 0.05);
    tl.to("#s15-spark", { scale: 0, opacity: 0, duration: 0.1, ease: "power2.in" }, S.flash + 0.04);
    tl.set(".flat", { opacity: 0 }, S.flash);
    tl.fromTo("#s15-flash", { opacity: 0 }, { opacity: 0.9, duration: 0.06, ease: "none" }, S.flash);
    tl.to("#s15-flash", { opacity: 0, duration: 0.4, ease: "power2.out" }, S.flash + 0.06);

    // 3. Shards: each face flies in from its own side and locks (Report = left, Track = right, Respond = top)
    const fly = (sel, at, from) => {
      // launches after the flash and lands exactly on its beat (the spoken word)
      tl.fromTo(sel, { opacity: 0, ...from }, { opacity: 1, x: 0, y: 0, rotation: 0, scale: 1, duration: 0.24, ease: "expo.out" }, at - 0.22);
    };
    fly(shards.l, S.shardL, { x: -230, y: 60, rotation: -28, scale: 1.6 });
    fly(shards.r, S.shardR, { x: 230, y: 60, rotation: 28, scale: 1.6 });
    fly(shards.t, S.shardT, { x: 0, y: -210, rotation: 0, scale: 1.6 });
    tl.fromTo("#s15-glow", { opacity: 0.5 }, { opacity: 0.9, duration: 0.3, ease: "power2.out" }, S.shardT);

    // 4. Lock: the T-gap flashes white, shockwave ring, crossfade to the real logo artwork
    tl.fromTo("#s15-edges", { opacity: 0 }, { opacity: 1, duration: 0.08, ease: "none" }, S.lock);
    tl.to("#s15-edges", { opacity: 0, duration: 0.45, ease: "power2.out" }, S.lock + 0.1);
    tl.fromTo("#s15-ring", { opacity: 0.9, scale: 0.35 }, { opacity: 0, scale: 2.2, duration: 0.9, ease: "expo.out" }, S.lock);
    tl.fromTo("#s15-logo", { scale: 1.12 }, { scale: 1, duration: 0.6, ease: "expo.out" }, S.lock);
    tl.to("#s15-png", { opacity: 1, duration: 0.35, ease: "power1.inOut" }, S.lock + 0.15);
    tl.to(".s15-shards", { opacity: 0, duration: 0.35, ease: "power1.inOut" }, S.lock + 0.15);

    // 5. Wordmark wipes in left → right ("Threat" then "Track"), then tagline and pill
    tl.set("#s15-word", { opacity: 1 }, S.word);
    tl.to("#s15-word .line", { clipPath: "inset(0% 0% 0% 0%)", duration: 0.6, ease: "power3.inOut" }, S.word);
    tl.fromTo("#s15-word", { y: 14 }, { y: 0, duration: 0.6, ease: "power3.out" }, S.word);
    tl.fromTo("#s15-tag", { opacity: 0, y: 18 }, { opacity: 1, y: 0, duration: 0.5, ease: "expo.out" }, S.tag);
    tl.fromTo("#s15-pill", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(1.4)" }, S.pill);
  }

  // ---------------------------------------------------------------------------
  // Top Dispatch HUD (`#hud`): Live Case Monitor & Brand Morph
  // ---------------------------------------------------------------------------
  {
    const h0 = 17.65, hEnd = 61.2, jump = T.s11.start;
    const fmt = (sec) => {
      const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = Math.floor(sec % 60);
      return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
    };
    const base1 = 18 * 3600 + 41 * 60 + 7, base2 = 19 * 3600 + 12 * 60 + 7;
    for (let t = h0; t < hEnd; t += 1) {
      const sec = t < jump ? base1 + Math.round(t - h0) : base2 + Math.round(t - jump);
      tl.set("#hud-clock", { textContent: fmt(sec) }, +t.toFixed(2));
    }

    tl.set("#hud-case", { display: "flex", y: 0, opacity: 1 }, 0);
    tl.set("#hud-brand", { display: "none", opacity: 0, y: 24 }, 0);
    tl.fromTo("#hud", { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, h0);
    tl.to("#hud", { y: -30, opacity: 0, duration: 0.4, ease: "power2.in" }, hEnd - 0.4);

    const status = (t, text, bg) => {
      const dark = bg === "#ff9f0a" || bg === "#30d158" || bg === "#22c55e";
      tl.to("#hud-st", { scale: 0.85, opacity: 0, duration: 0.15, ease: "power2.in" }, t - 0.15);
      tl.set("#hud-st", { textContent: text, backgroundColor: bg, color: dark ? "#052e16" : "#ffffff" }, t);
      tl.to("#hud-st", { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.4)" }, t);
    };

    status(T.s7.sent, "SUBMITTED", "#dc2626");
    status(T.s8.p2, "UNDER REVIEW", "#f59e0b");
    status(T.s8.p3, "VERIFIED", "#0ea5e9");
    status(T.s8.p4, "RESPONDING", "#7c3aed");
    status(T.s10.way, "HELP ON THE WAY", "#7c3aed");

    // 45.5s: Morph from live case monitor into #hud-brand (BUILT FOR VALENZUELANOS)
    const morphT = 45.5;
    tl.to("#hud-case", { y: -24, opacity: 0, duration: 0.35, ease: "power2.in" }, morphT);
    tl.set("#hud-case", { display: "none" }, morphT + 0.35);
    tl.set("#hud-brand", { display: "flex", y: 24, opacity: 0 }, morphT + 0.35);
    tl.to("#hud-brand", { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, morphT + 0.35);
  }

  // ---------------------------------------------------------------------------
  // CAMERA (v4). One block owns all framing. Each scene's stage (`#sN > .in`, or #rig-s10) is moved in 2D
  // (x, y, scale, small rotation); the section background stays put, so moves never reveal the navy root.
  // Style per scene: smooth tracking/pushes for product moments, bold punches/whips for kinetic type.
  // Rule (CLAUDE.md §4): every scene settles to a reading frame (scale ≤ 1.06, near-centred) before its
  // QA checkpoint in tools/qa-audit.mjs. All times are SOURCE seconds (warped like everything else).
  // ---------------------------------------------------------------------------
  {
    const stage = (n) => (n === 10 ? "#rig-s10" : `#s${n} > .in`);
    const ST = {};
    for (let n = 1; n <= 15; n++) {
      ST[n] = stage(n);
      tl.set(ST[n], { x: 0, y: 0, scale: 1, rotation: 0, transformOrigin: "50% 50%" }, 0);
    }
    // Measure element centres once, untransformed, relative to their stage (stage space = 1920×1080).
    const centre = (n, sel) => {
      const st = document.querySelector(ST[n]), el = document.querySelector(sel);
      if (!st || !el) return { x: 960, y: 540 };
      const a = st.getBoundingClientRect(), b = el.getBoundingClientRect();
      const k = a.width / 1920 || 1; // in case the page is presentation-scaled
      return { x: (b.left + b.width / 2 - a.left) / k, y: (b.top + b.height / 2 - a.top) / k };
    };
    const move = (n, t, d, v, ease = "power2.inOut") =>
      tl.to(ST[n], { x: v.x ?? 0, y: v.y ?? 0, scale: v.s ?? 1, rotation: v.r ?? 0, duration: d, ease }, t);
    // Frame element `sel` at scale s (its centre moves to the frame centre).
    const look = (n, sel, s, t, d, ease = "power2.inOut") => {
      const c = centre(n, sel);
      move(n, t, d, { x: s * (960 - c.x), y: s * (540 - c.y), s }, ease);
    };
    const punchCam = (n, t, from = 1.18, to = 1, d = 0.6, r = 0) =>
      tl.fromTo(ST[n], { scale: from, rotation: r }, { scale: to, rotation: 0, duration: d, ease: "expo.out" }, t);

    // Whip pans with a horizontal motion blur (#mblur). Scale 1.35 keeps the frame covered at ±320 px.
    const blur = "#mblur-dev";
    const whipOut = (n, end, dir = -1) => {
      const t = end - 0.16;
      tl.set(ST[n], { filter: "url(#mblur)" }, t);
      tl.to(ST[n], { x: dir * 320, scale: 1.35, duration: 0.16, ease: "expo.in" }, t);
      tl.fromTo(blur, { attr: { stdDeviation: "0 0" } }, { attr: { stdDeviation: "40 0" }, duration: 0.16, ease: "expo.in" }, t);
    };
    const whipIn = (n, start, dir = -1) => {
      tl.set(ST[n], { filter: "url(#mblur)" }, start);
      tl.fromTo(ST[n], { x: -dir * 320, scale: 1.35 }, { x: 0, scale: 1, duration: 0.34, ease: "expo.out" }, start);
      tl.fromTo(blur, { attr: { stdDeviation: "40 0" } }, { attr: { stdDeviation: "0 0" }, duration: 0.3, ease: "expo.out" }, start);
      tl.set(ST[n], { filter: "none" }, start + 0.26);
    };
    // Zoom-through: the outgoing stage rushes past the lens, the incoming one lands from slightly wide.
    const zoomOut = (n, end) => tl.to(ST[n], { scale: 2.6, opacity: 0, duration: 0.32, ease: "expo.in" }, end - 0.32);
    const zoomIn = (n, start) =>
      tl.fromTo(ST[n], { scale: 0.84, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6, ease: "expo.out" }, start);

    // s1 · smooth: slow drone push on each beat
    move(1, 0, 1.4, { s: 1.04, x: -20 }, "sine.out");
    move(1, T.s1.b2 - 0.15, 0.15, { s: 1 }, "power2.in");
    move(1, T.s1.b2, T.s1.end - T.s1.b2, { s: 1.04, x: 16 }, "sine.out");

    // s2 · bold: snap zoom onto the words, then creep in
    punchCam(2, T.s2.w1, 1.25, 1.0, 0.7);
    move(2, T.s2.w1 + 0.7, T.s2.end - T.s2.w1 - 0.7, { s: 1.05 }, "none");

    // s3 · bold: land, punch on "Make", zoom-through into s4
    punchCam(3, T.s3.start, 1.15, 1.0, 0.6);
    look(3, "#s3-make", 1.12, 6.1, 0.28, "expo.out");
    move(3, 6.36, 0.3, { s: 1.03 }, "power2.inOut");
    zoomOut(3, T.s3.end);
    zoomIn(4, T.s4.start);

    // s4 · smooth tracking along the architecture flow, then pull back wide (QA reads the wide frame)
    look(4, "#s4-c1", 1.16, 8.6, 0.55);
    look(4, "#s4-c3", 1.16, 9.15, 0.6);
    look(4, "#s4-c6", 1.16, 9.75, 0.6);
    move(4, 10.35, 0.6, { s: 1 }, "power2.inOut");
    whipOut(4, T.s4.end, -1);

    // s5 · bold: whip in, punch each creed word with a small alternating tilt, whip out
    whipIn(5, T.s5.start, -1);
    punchCam(5, 12.1, 1.22, 1.0, 0.55, -1.5);
    punchCam(5, 12.8, 1.26, 1.0, 0.55, 1.5);
    whipOut(5, T.s5.end, -1);

    // s6 · smooth → bold: push into the SOS button through the hold, punch out on release, settle wide
    whipIn(6, T.s6.start, -1);
    look(6, "#sos-btn", 1.28, 14.3, 2.0, "power1.inOut");
    move(6, 16.35, 0.55, { s: 1 }, "expo.out");
    move(6, 16.9, T.s6.end - 16.9, { s: 1.03 }, "none");

    // s7 · smooth: follow each tap down the phone, pull back to show the toast
    look(7, "#s7-cat", 1.2, 20.45, 0.5);
    look(7, "#s7-role", 1.2, 21.35, 0.5);
    look(7, "#s7-photo", 1.2, 22.25, 0.5);
    look(7, "#s7-btn", 1.14, 23.05, 0.45);
    move(7, 23.55, 0.6, { s: 1 }, "power2.inOut");

    // s8 · smooth: tilt down the status pipeline as each stage lights, then settle
    ["#s8-p1", "#s8-p2", "#s8-p3", "#s8-p4", "#s8-p5"].forEach((sel, i) => look(8, sel, 1.14, T.s8[`p${i + 1}`] - 0.25, 0.45));
    move(8, 27.65, 0.55, { s: 1 }, "power2.inOut");

    // s9 · dolly in on the queue, punch when TR-4821 slams in, ease back; whip to the dispatch bridge
    move(9, T.s9.card, 30.2 - T.s9.card, { s: 1.05 }, "sine.inOut");
    look(9, "#s9-new", 1.16, 30.3, 0.35, "expo.out");
    move(9, 30.75, 0.5, { s: 1.02 }, "power2.inOut");
    whipOut(9, T.s9.end, -1);

    // s10 · smooth tracking: citizen → HQ → sub-station following the beams, pull back on "help is coming"
    whipIn(10, T.s10.start, -1);
    look(10, "#s10-col-1", 1.15, 33.25, 0.6);
    look(10, "#s10-col-2", 1.15, T.s10.aiStart - 0.2, 0.8);
    look(10, "#s10-col-3", 1.15, T.s10.subDeploy - 0.3, 0.8);
    move(10, T.s10.way - 0.4, 0.8, { s: 1 }, "power2.inOut");

    // s11 · smooth: slow orbit-and-push on the radar, settle for reading
    move(11, T.s11.start, 2.0, { s: 1.1, r: -2 }, "sine.inOut");
    move(11, 46.4, 0.55, { s: 1.02, r: 0 }, "power2.inOut");

    // s12 · smooth: push into the plan card while the AI writes, ease back on approve; whip into the storm
    look(12, "#s12-card", 1.12, T.s12.clickGen - 0.1, 0.6);
    move(12, T.s12.approve, 0.6, { s: 1 }, "power2.inOut");
    whipOut(12, T.s12.end, 1);

    // s13 · bold: each phrase alternates a punch and a side slide, on its spoken word; zoom-through out
    whipIn(13, T.s13.start, 1);
    T.s13.w.forEach((t, i) => {
      if (i === 0) return;
      if (i % 2) tl.fromTo(ST[13], { x: (i % 4 === 1 ? 1 : -1) * 240, scale: 1.12 }, { x: 0, scale: 1, duration: 0.45, ease: "expo.out" }, t);
      else punchCam(13, t, 1.2, 1.0, 0.5);
    });
    zoomOut(13, T.s13.end);

    // s14 · smooth: pull-back reveal of the connected network
    tl.fromTo(ST[14], { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 1.6, ease: "power3.out" }, T.s14.start);

    // s15 · bold: punch on the flash, small hits as each shard locks, a bigger hit on lock, then a slow push
    move(15, T.s15.line, 1.1, { s: 1.06 }, "sine.inOut");
    punchCam(15, T.s15.flash, 1.14, 1.0, 0.5);
    [T.s15.shardL, T.s15.shardR, T.s15.shardT].forEach((t) => punchCam(15, t, 1.035, 1.0, 0.35));
    punchCam(15, T.s15.lock, 1.08, 1.0, 0.6);
    move(15, T.s15.lock + 0.6, T.s15.end - T.s15.lock - 0.6, { s: 1.04 }, "none");
  }

  // ---------------------------------------------------------------------------
  // VO captions (#vo-caption-bar): already in OUTPUT seconds (TL.captions from tools/retime.mjs),
  // so they bypass the warp. Driven by the timeline, so they appear in the render too.
  // ---------------------------------------------------------------------------
  {
    const R = tl.__raw;
    const bar = "#vo-caption-bar";
    R.set(bar, { opacity: 0, y: 8, textContent: "" }, 0);
    (T.captions || []).forEach((c, i, all) => {
      const next = all[i + 1];
      const joined = next && next.start - c.end < 0.05; // chunk of the same line: swap text, no fade
      R.set(bar, { textContent: c.text }, c.start);
      const prevJoined = i > 0 && c.start - all[i - 1].end < 0.05;
      if (!prevJoined) R.to(bar, { opacity: 1, y: 0, duration: 0.2, ease: "power2.out" }, c.start);
      if (!joined) R.to(bar, { opacity: 0, y: 4, duration: 0.2, ease: "power2.in" }, Math.max(c.start + 0.2, c.end));
    });
  }

  tl.set({}, {}, T.duration); // T.duration is source time; warped to the output length
  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
  window.__mainTimeline = tl;
  window.masterTimeline = tl;
  window.tl = tl;
  tl.seek(0);
})();
