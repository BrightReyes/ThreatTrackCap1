// assets/anim.js — Broadcast Cinematography Primitives (GSAP v3.12.5)
// ThreatTrack Promo v2.0 Cinematic Overhaul

/**
 * 1. Kinetic Word Snap with Calm Pacing & Crisp Slate Rendering
 */
function snap(tl, targets, at, opts = {}) {
  const {
    stagger = 0.045,
    duration = 0.75,
    y = 28,
    z = 0,
    rotX = 0,
    blur = 6,
    ease = "power3.out"
  } = opts;

  const elements = typeof targets === "string" ? document.querySelectorAll(`${targets} .w`) : targets;
  if (!elements || elements.length === 0) return;

  tl.fromTo(
    elements,
    {
      opacity: 0,
      y,
      z,
      rotationX: rotX,
      scaleY: 1.0,
      filter: `blur(${blur}px)`,
      transformOrigin: "50% 100% 0px"
    },
    {
      opacity: 1,
      y: 0,
      z: 0,
      rotationX: 0,
      scaleY: 1,
      filter: "blur(0px)",
      duration,
      stagger,
      ease
    },
    at
  );
}

/**
 * 2. High-Velocity Whip Exit
 */
function snapOut(tl, targets, at, opts = {}) {
  const { stagger = 0.025, duration = 0.35, y = -48, z = 90 } = opts;
  const elements = typeof targets === "string" ? document.querySelectorAll(`${targets} .w`) : targets;
  if (!elements || elements.length === 0) return;

  tl.to(
    elements,
    {
      opacity: 0,
      y,
      z,
      scaleY: 1.18,
      filter: "blur(12px)",
      duration,
      stagger,
      ease: "expo.in"
    },
    at
  );
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
      scale: 0.96,
      filter: "blur(8px)"
    },
    {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
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
        rotationX: `+=${tiltX}`,
        rotationY: `+=${tiltY}`,
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
          rotationX: `-=${tiltX}`,
          rotationY: `-=${tiltY}`,
          scale: 1,
          duration: 0.55,
          ease: "elastic.out(1.2, 0.5)"
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
function punch(tl, rigEl, at, intensity = 1.08) {
  const el = typeof rigEl === "string" ? document.querySelector(rigEl) : rigEl;
  if (!el) return;
  tl.fromTo(
    el,
    { scale: intensity },
    { scale: 1, duration: 0.55, ease: "expo.out" },
    at
  );
}

function drive(tl, rigEl, at, duration, opts = {}) {
  const { fromScale = 1, toScale = 1.12, rotZ = 0, x = 0, y = 0 } = opts;
  const el = typeof rigEl === "string" ? document.querySelector(rigEl) : rigEl;
  if (!el) return;
  tl.fromTo(
    el,
    { scale: fromScale, rotationZ: 0, x: 0, y: 0 },
    { scale: toScale, rotationZ: rotZ, x, y, duration, ease: "none" },
    at
  );
}

function rackFocus(tl, focusEls, blurEls, at, blurPx = 8) {
  if (focusEls) {
    tl.to(
      focusEls,
      { filter: "blur(0px)", opacity: 1, z: "+=40", duration: 0.45, ease: "expo.out" },
      at
    );
  }
  if (blurEls) {
    tl.to(
      blurEls,
      { filter: `blur(${blurPx}px)`, opacity: 0.42, duration: 0.45, ease: "expo.out" },
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
        filter: "blur(8px)",
        duration: 0.55,
        ease: "power2.inOut"
      },
      at
    );
  }
  if (inRig) {
    tl.fromTo(
      inRig,
      { y: 20, opacity: 0, filter: "blur(6px)" },
      { y: 0, opacity: 1, filter: "blur(0px)", duration: 0.55, ease: "power2.out" },
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
      { opacity: 0, y: 32, scale: 0.94, filter: "blur(8px)" },
      { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", duration: 0.65, stagger, ease: "power3.out" },
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
    tl.fromTo(sel, { opacity: 0, scale: 0.3 }, { opacity: 1, scale: 1, duration: 0.3, ease: "back.out(2)" }, t);
    tl.fromTo(`${sel} i`, { scale: 1, opacity: 0.9 }, { scale: 2.6, opacity: 0, duration: 0.9, ease: "power2.out" }, t + 0.05);
  }

  // ---------------------------------------------------------------------------
  // Scene 1 (0.0s – 3.2s) · Clean Light Connected City Blueprint Hook
  // ---------------------------------------------------------------------------
  {
    const S = T.s1;
    tl.set(["#s1-top-pill", ".s1-node-card", "#s1-network-svg", ".s1-sonar-ring", "#s1-beat1-wrap", "#s1-cmd-pill"], { opacity: 0 }, 0);
    tl.set("#s1-beat2-wrap", { display: "none", opacity: 0 }, 0);
    tl.set("#rig-s1", { scale: 1, rotationX: 0, rotationY: 0, z: 0 }, 0);

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
    tl.fromTo("#s1-cmd-pill", { opacity: 0, y: -12, scale: 0.95 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(1.7)" }, S.b1 - 0.05);
    snap(tl, "#s1-w1", S.b1, { stagger: 0.06, y: 44, rotX: 0, blur: 10, ease: "expo.out" });
    punch(tl, "#rig-s1", S.b1 + 0.1, 1.05);
    snapOut(tl, "#s1-w1", S.b1End, { stagger: 0.03, y: -32, duration: 0.25 });
    tl.to("#s1-cmd-pill", { opacity: 0, y: -16, duration: 0.2 }, S.b1End + 0.05);
    tl.set("#s1-beat1-wrap", { display: "none" }, S.b1End + 0.25);

    // Beat 2 (1.6s – 3.0s): "...where help is always within reach."
    tl.set("#s1-beat2-wrap", { display: "flex", opacity: 1 }, S.b2 - 0.05);
    snap(tl, "#s1-w2", S.b2, { stagger: 0.05, y: 44, rotX: 0, blur: 10, ease: "expo.out" });
    tl.fromTo("#s1-telemetry-bar", { opacity: 0, y: 24, scale: 0.94 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.8)" }, S.b2 + 0.15);
    drive(tl, "#rig-s1", S.b2, S.end - S.b2, { fromScale: 1, toScale: 1.05 });
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
    // Whip-zoom entrance
    tl.fromTo(
      "#rig-s2",
      { scale: 0.7, opacity: 0, filter: "blur(18px)" },
      { scale: 1, opacity: 1, filter: "blur(0px)", duration: 0.5, ease: "expo.out" },
      S.start
    );
    // 3D word pitch snap
    snap(tl, "#s2-kt", S.w1, { stagger: 0.08, rotX: -55, duration: 0.65 });
    drive(tl, "#rig-s2", S.start, S.end - S.start, { fromScale: 1, toScale: 1.07 });

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
    drive(tl, "#rig-s3", S.start, S.end - S.start, { fromScale: 1, toScale: 1.07 });

    // 6.1s: High-frequency camera shake as "Make" ignites in crimson
    tl.fromTo(
      "#rig-s3",
      { x: -4, y: 3 },
      { x: 4, y: -3, duration: 0.04, repeat: 5, yoyo: true, ease: "none" },
      6.1
    );
    tl.to("#rig-s3", { x: 0, y: 0, duration: 0.1 }, 6.1 + 0.22);
    tl.to(
      "#s3-make",
      { scale: 1.15, filter: "drop-shadow(0 0 24px #dc2626)", duration: 0.25, yoyo: true, repeat: 1 },
      6.1
    );

    // 7.65s: Portal zoom straight through "Make" into Scene 4
    portalZoom(tl, "#rig-s3", "#rig-s4", 7.65);
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
      filter: "blur(0px)",
      borderColor: "rgba(220, 38, 38, 0.55)",
      boxShadow: "0 22px 50px -10px rgba(220, 38, 38, 0.22)"
    }, s4Start);

    tl.set(["#s4-c2", "#s4-c3", "#s4-c4", "#s4-c5", "#s4-c6"], {
      opacity: 0.26,
      scale: 0.95,
      filter: "blur(10px)",
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
      { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(1.4)" },
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
        filter: "blur(0px)",
        opacity: 1,
        scale: 1,
        borderColor: step.border,
        boxShadow: `0 22px 50px -10px ${step.glow}`,
        duration: 0.25,
        ease: "back.out(1.3)"
      }, step.at + 0.18);
    });

    // Smooth 2D camera drift forward
    drive(tl, "#rig-s4", S.fly, S.end - S.fly, { fromScale: 0.98, toScale: 1.02 });

    // 11.15s: Calm cross-dissolve & gentle glide into Scene 5
    tl.to(
      "#rig-s4",
      { scale: 1.25, opacity: 0, filter: "blur(8px)", duration: S.end - 11.15, ease: "power2.in" },
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
    tl.fromTo("#s5-a", { opacity: 0, scale: 2.2, filter: "blur(18px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.35, ease: "expo.out" }, 11.4);
    tl.to("#s5-a", { opacity: 0, scale: 0.8, filter: "blur(10px)", duration: 0.18, ease: "expo.in" }, 12.05);

    // 12.10s: "Track." Hard cut to Dark Slate BG, pure white text, emerald green nodes glowing
    tl.set("#s5-bg-light", { opacity: 0 }, 12.1);
    tl.set("#s5-wireframe", { opacity: 0 }, 12.1);
    tl.set("#s5-bg-dark", { opacity: 1 }, 12.1);
    tl.fromTo("#s5-nodes", { opacity: 0, scale: 0.8 }, { opacity: 0.45, scale: 1.2, duration: 0.65, ease: "power2.out" }, 12.1);
    tl.set("#s5-b", { color: "#ffffff" }, 12.1);
    tl.fromTo("#s5-b", { opacity: 0, scale: 2.2, filter: "blur(18px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.35, ease: "expo.out" }, 12.1);
    tl.to("#s5-b", { opacity: 0, scale: 0.8, filter: "blur(10px)", duration: 0.18, ease: "expo.in" }, 12.75);

    // 12.80s: "Respond." Hard cut to Signature Crimson Red Gradient BG, pure white text with dark drop shadow, camera punch
    tl.set("#s5-bg-dark", { opacity: 0 }, 12.8);
    tl.set("#s5-nodes", { opacity: 0 }, 12.8);
    tl.set("#s5-bg-crimson", { opacity: 1 }, 12.8);
    tl.set("#s5-c", { color: "#ffffff" }, 12.8);
    tl.fromTo("#s5-c", { opacity: 0, scale: 2.3, filter: "blur(20px)" }, { opacity: 1, scale: 1, filter: "blur(0px)", duration: 0.38, ease: "expo.out" }, 12.8);
    punch(tl, "#rig-s5", 12.8, 1.14);
    drive(tl, "#rig-s5", 11.4, S.end - 11.4, { fromScale: 1, toScale: 1.08 });
    tl.to("#rig-s5", { opacity: 0, filter: "blur(12px)", duration: 0.22 }, S.end - 0.22);
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
    tl.to(["#s6-sub", "#s6-card"], { opacity: 0, filter: "blur(10px)", duration: 0.25 }, S.end - 0.25);
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
    tl.fromTo("#s7-photo .ok", { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" }, 22.65);
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
      tl.fromTo(`${id} .chk svg`, { opacity: 0, scale: 0.4 }, { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(2)" }, t + 0.05);
      tl.to(`${id} .t`, { color: isLive ? "#dc2626" : "#047857", duration: 0.25 }, t);
      tl.fromTo(id, { scale: 1 }, { scale: 1.04, z: 32, duration: 0.15, yoyo: true, repeat: 1 }, t);
    };

    lightStage("#s8-p1", S.p1);
    lightStage("#s8-p2", S.p2);
    lightStage("#s8-p3", S.p3);
    lightStage("#s8-p4", S.p4, true);
    lightStage("#s8-p5", S.p5);

    snapOut(tl, "#s8-kt", S.end - 0.22);
    tl.to(["#s8-sub", "#s8-card"], { opacity: 0, filter: "blur(10px)", duration: 0.22 }, S.end - 0.22);
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
      tl.fromTo(st, { scale: 0.85, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.45, ease: "back.out(1.5)" }, S.stats + i * 0.1);
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
    tl.to(["#s9-sub", "#s9-card"], { opacity: 0, filter: "blur(10px)", duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 10 (32.9s – 42.9s | 10.0 SECONDS) · 3-Way Real-Time Dispatch Bridge
  // ---------------------------------------------------------------------------
  {
    const S = T.s10;
    const t10 = S.start; // 32.9s

    // 0. INITIAL RESET AT t10 (0.0s relative)
    tl.set("#s10-col-1", { opacity: 1, filter: "blur(0px)", scale: 1 }, t10);
    tl.set(["#s10-col-2", "#s10-col-3"], { opacity: 0.25, filter: "blur(9px)", scale: 0.96 }, t10);
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
      .to(["#s10-c1-btn", "#s10-cursor"], { scale: 1, duration: 0.3, ease: "back.out(1.6)" }, t10 + 0.77)
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
      filter: "blur(0px)",
      opacity: 1,
      scale: 1,
      duration: 0.4,
      ease: "back.out(1.3)"
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
      .to(["#s10-hq-btn", "#s10-cursor"], { scale: 1, duration: 0.28, ease: "back.out(1.6)" }, t10 + 5.22)
      .set("#s10-hq-btn", { className: "s10-hq-btn assigned" }, t10 + 5.24)
      .set("#s10-hq-btn-txt", { textContent: "✓ Assigned to Mapulang Lupa Sub-Station" }, t10 + 5.24);

    // -------------------------------------------------------------------------
    // BEAT 3 (5.6s – 7.6s): RELAY BEAM + SUB-STATION DEPLOYMENT
    // -------------------------------------------------------------------------
    tl.to("#s10-beam-2", { scaleX: 1, duration: 0.35, ease: "power2.inOut" }, t10 + 5.60)
      .to("#s10-col-3", { filter: "blur(0px)", opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.3)" }, t10 + 5.95)
      .set("#s10-card-3", { className: "s10-card s10-dark-card is-alerted" }, t10 + 5.95)
      .to("#s10-cursor", { x: 1565, y: 705, duration: 0.5, ease: "power3.inOut" }, t10 + 6.30)
      .to(["#s10-sub-btn", "#s10-cursor"], { scale: 0.93, duration: 0.12, ease: "power2.in" }, t10 + 6.95)
      .to(["#s10-sub-btn", "#s10-cursor"], { scale: 1, duration: 0.28, ease: "back.out(1.6)" }, t10 + 7.07)
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
      .to("#s10-return-pill", { opacity: 1, scale: 1, duration: 0.35, ease: "back.out(1.5)" }, t10 + 7.90)
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
      .fromTo("#s10-card-1", { scale: 1.03 }, { scale: 1, duration: 0.4, ease: "back.out(1.5)" }, confirmAt)
      .to("#s10-c1-route-prog", { width: "86%", duration: 0.85, ease: "power2.out" }, confirmAt + 0.05)
      .set("#s10-bench-box", { className: "s10-benchmark-box is-locked" }, confirmAt)
      .set("#s10-bench-prefix", { textContent: "TOTAL ROUND-TRIP:" }, confirmAt)
      .set("#s10-bench-timer", { textContent: "2.84 SECONDS" }, confirmAt)
      .fromTo("#s10-bench-box", { scale: 1.06 }, { scale: 1, duration: 0.4, ease: "back.out(1.6)" }, confirmAt);

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
    tl.to(["#rig-s10", "#s10"], { opacity: 0, filter: "blur(10px)", duration: 0.25 }, S.end - 0.25);
  }

  // ---------------------------------------------------------------------------
  // Scene 11 (38.4s – 42.6s) · Flat 2D Hotspot Radar & Predictive Analytics
  // ---------------------------------------------------------------------------
  {
    const S = T.s11;
    tl.set(["#s11-radar", "#s11-hot"], { opacity: 0 }, 0);
    tl.set("#s11-radar", { rotationX: 0, rotationY: 0, rotationZ: 0, scale: 1 }, 0);
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
  // Scene 12 (48.6s – 57.0s | 8.4s) · AI Decision Support & Interactive RAG Flow
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
      .to(["#s12-gen-btn", "#s12-cursor"], { scale: 1, duration: 0.15, ease: "back.out(1.6)" }, t12 + 1.50);

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
    tl.to("#s12-node-1", { scale: 1.06, opacity: 1, duration: 0.35, ease: "back.out(2)" }, loadT);
    tl.to("#s12-cfill-1", { width: "100%", duration: 0.70, ease: "power2.inOut" }, loadT + 0.20);
    tl.to("#s12-node-2", { scale: 1.06, opacity: 1, duration: 0.35, ease: "back.out(2)" }, loadT + 0.85);
    tl.to("#s12-cfill-2", { width: "100%", duration: 0.70, ease: "power2.inOut" }, loadT + 1.05);
    tl.to("#s12-node-3", { scale: 1.06, opacity: 1, duration: 0.35, ease: "back.out(2)" }, loadT + 1.70);

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
      tl.fromTo(g, { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.4, ease: "back.out(1.8)" }, ansT + 1.30 + i * 0.1);
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
          ease: "back.out(2)"
        }, approveAt + 0.10)
        .to("#s12-cursor", { scale: 1, opacity: 0, duration: 0.3 }, approveAt + 0.10);
    }

    // Clean exit holding still until S.end
    snapOut(tl, "#s12-kt", S.end - 0.22);
    tl.to(["#s12-sub", "#s12-card", "#s12-pipeline"], { opacity: 0, duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 13 (51.5s – 55.7s) · Valenzuela Community Storm
  // ---------------------------------------------------------------------------
  {
    const S = T.s13;
    const phrases = ["#s13-w0", "#s13-w1", "#s13-w2", "#s13-w3", "#s13-w4", "#s13-w5"];
    const rolls = [-1.5, 1.5, -1.8, 1.8, -2.0, 0];
    const punches = [1.04, 1.06, 1.08, 1.10, 1.12, 1.14];

    phrases.forEach((id, i) => {
      const t = S.w[i];
      const nextT = S.w[i + 1] ?? S.end;
      snap(tl, id, t, { rotX: -40, stagger: 0.04 });
      tl.to("#rig-s13", { rotationZ: rolls[i], scale: punches[i], duration: 0.45, ease: "expo.out" }, t);
      if (i < 5) snapOut(tl, id, nextT - 0.12);
    });

    tl.fromTo("#s13-t", { opacity: 0, letterSpacing: "0.5em" }, { opacity: 1, letterSpacing: "0.2em", duration: 1.2, ease: "power3.out" }, S.w[0] + 0.3);
    tl.to("#rig-s13", { opacity: 0, filter: "blur(12px)", duration: 0.22 }, S.end - 0.22);
  }

  // ---------------------------------------------------------------------------
  // Scene 14 (55.7s – 59.9s) · Blurred Ecosystem Convergence & Hero Copy
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
      { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.8)" },
      S.title + 0.35
    );

    // Camera micro-drive
    drive(tl, "#rig-s14", S.fly, S.end - S.fly, { fromScale: 1, toScale: 1.05 });

    // 65.0s: Clean condensation into Scene 15's single flatline
    tl.to(
      ["#s14-bg-net", "#s14-top-pill", "#s14-node-bar", "#s14-kt"],
      { opacity: 0, scale: 0.96, filter: "blur(12px)", duration: 0.38, ease: "expo.in" },
      65.0
    );
  }

  // ---------------------------------------------------------------------------
  // Scene 15 (59.9s – 66.5s) · Case Resolution & Grand Brand Outro
  // ---------------------------------------------------------------------------
  {
    const S = T.s15;
    tl.set("#s15-line", { strokeDasharray: 2200, strokeDashoffset: 2200 }, 0);
    tl.set(["#s15-logo", "#s15-word", "#s15-tag", "#s15-pill", "#s15-res"], { opacity: 0 }, 0);

    // EKG vital line draws across stage (59.9s – 61.5s)
    tl.to("#s15-line", { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut" }, S.line);
    // Spiking with crimson before flattening to emerald
    tl.fromTo("#s15-glow", { scale: 0.2, opacity: 0 }, { scale: 1.2, opacity: 1, duration: 0.9, ease: "power2.out" }, S.line + 0.3);

    // CASE TR-4821 · RESOLVED · T+31:00 locks in with tactile snap
    tl.fromTo("#s15-res", { opacity: 0, y: 20, scale: 0.8 }, { opacity: 1, y: 0, scale: 1, duration: 0.45, ease: "back.out(2)" }, S.res);
    tl.to("#s15-res", { opacity: 0, y: -15, duration: 0.25, ease: "power2.in" }, 67.35);

    // 67.6s: Reveal hero ThreatTrack shield logo in 3D (fromZ: 220px, rotationY: -25deg -> 0deg)
    cardIn(tl, "#s15-logo", 67.6, { fromZ: 220, fromRotY: -25, toRotY: 0, toRotX: 0, driftDuration: 4.4 });
    punch(tl, "#rig-s15", 67.6, 1.15);

    tl.fromTo("#s15-word", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.55, ease: "expo.out" }, S.word);
    tl.fromTo("#s15-tag", { opacity: 0, y: 25 }, { opacity: 1, y: 0, duration: 0.45, ease: "expo.out" }, S.tag);
    tl.fromTo("#s15-pill", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.45, ease: "back.out(2)" }, S.pill);
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
      tl.to("#hud-st", { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" }, t);
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

  tl.set({}, {}, T.duration);
  window.__timelines = window.__timelines || {};
  window.__timelines.main = tl;
  window.__mainTimeline = tl;
  window.masterTimeline = tl;
  window.tl = tl;
  tl.seek(0);
})();
