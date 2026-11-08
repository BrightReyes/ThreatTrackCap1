(function () {
  var P = 'power3.out', E = 'expo.out', N = 'none';
  var q = function (s) { return Array.prototype.slice.call(document.querySelectorAll(s)); };

  // ---- Build-time geometry -------------------------------------------------
  // Phone body: stacked plates give it real thickness when the camera orbits.
  var depth = document.getElementById('phone-depth');
  for (var d = 0; d < 16; d++) {
    var plate = document.createElement('i');
    plate.style.transform = 'translateZ(' + (-d * 1.4) + 'px)';
    if (d > 0) plate.style.background = '#1e293b';
    depth.appendChild(plate);
  }

  // White type is a clone of the dark type, riding inside the flood clip.
  var slot = document.getElementById('copy-flood-slot');
  slot.appendChild(document.getElementById('copy-base').cloneNode(true)).removeAttribute('id');

  // Extrude the hero type: stacked copies in Z.
  function extrude(el, layers, step, color) {
    var html = el.innerHTML;
    el.style.transformStyle = 'preserve-3d';
    for (var i = layers; i > 0; i--) {
      var s = document.createElement('span');
      s.className = 'ex';
      s.innerHTML = html;
      s.style.color = color;
      s.style.transform = 'translateZ(' + (-i * step) + 'px)';
      el.appendChild(s);
    }
  }
  q('#copy-base .num').forEach(function (el) { extrude(el, 16, 3, '#94a3b8'); });
  q('#copy-flood-slot .num').forEach(function (el) { extrude(el, 16, 3, '#7f1d1d'); });
  q('.loc-1').forEach(function (el) { extrude(el, 9, 2.5, '#7f1d1d'); });

  // Rolling coordinate readout: fixed frames so the render is deterministic.
  var rollWrap = document.querySelector('.loc-2');
  var finalText = rollWrap.textContent;
  var rolls = ['14.3382°N  120.1175°E', '14.5907°N  120.6641°E', '14.6824°N  120.8215°E', '14.7016°N  120.9302°E', '14.7088°N  120.9471°E'];
  rollWrap.innerHTML = '';
  rolls.concat([finalText]).forEach(function (t, i) {
    var r = document.createElement('span');
    r.className = 'roll r' + i;
    r.textContent = t;
    rollWrap.appendChild(r);
  });

  var tl = gsap.timeline({ paused: true });

  // ---- Base poses ----------------------------------------------------------
  gsap.set('#rig', { transformOrigin: '960px 540px', rotationY: 18, rotationX: 14, z: -480 });
  gsap.set('#phone-base', { scale: .9 });
  gsap.set('#win-3d', { scale: .94 });
  gsap.set('#float-press', { z: 46 });
  gsap.set('#float-send', { z: 30 });
  gsap.set('#touch', { z: 34 });
  gsap.set('.p-row', { z: 12 });
  gsap.set('.cell', { z: 30 });
  gsap.set('#nearest', { z: 26 });
  gsap.set('#cursor', { z: 90 });
  gsap.set('.plx', { transformOrigin: '50% 50%' });

  // One call moves the camera and the parallax backdrop together.
  function cam(at, dur, ease, v) {
    tl.to('#rig', Object.assign({ duration: dur, ease: ease }, v), at);
    tl.to('.plx', {
      x: (v.rotationY || 0) * -16 - (v.x || 0) * .35,
      y: (v.rotationX || 0) * 14 - (v.y || 0) * .35,
      scale: 1 + (v.z || 0) / 1500,
      duration: dur, ease: ease
    }, at);
  }
  function blurHit(at, peak, hold) {
    tl.set('#cam', { filter: 'url(#mb)' }, at);
    tl.fromTo('#mbf', { attr: { stdDeviation: '0 0' } }, { attr: { stdDeviation: peak }, duration: .09, ease: N, immediateRender: false }, at);
    tl.to('#mbf', { attr: { stdDeviation: '0 0' }, duration: hold, ease: P }, at + .09);
    tl.set('#cam', { filter: 'none' }, at + .09 + hold);
  }

  // ---- Beat 1: phone flies in from depth ------------------------------------
  cam(0, .95, E, { x: 0, y: 0, z: 0, rotationY: 6, rotationX: 3 });
  tl.fromTo('#phone-in', { autoAlpha: 0 }, { autoAlpha: 1, duration: .2, ease: N }, 0);
  tl.fromTo('#phone', { rotationY: -72, rotationX: 22, rotationZ: -8, z: -360 },
                      { rotationY: 16, rotationX: 5, rotationZ: 0, z: 0, duration: .95, ease: E }, 0);
  tl.fromTo('.hold-line', { y: 30, z: -300, rotationY: 24, autoAlpha: 0, transformPerspective: 1200 },
                          { y: 0, z: 0, rotationY: -4, autoAlpha: 1, duration: .85, ease: E }, .22);

  // ---- Beat 2: three-second hold, camera pushes in hard on the button --------
  cam(.95, 2.75, 'power1.in', { x: 205, y: -135, z: 610, rotationY: -7, rotationX: 7 });
  tl.to('#phone', { rotationY: -16, rotationX: 2, duration: 2.75, ease: N }, .95);
  tl.to('.hold-line', { rotationY: 6, duration: 2.65, ease: N }, 1);

  [3, 2, 1].forEach(function (n, i) {
    var at = .7 + i;
    tl.set('.num' + n, { autoAlpha: 1 }, at);
    tl.fromTo('.num' + n, { z: -1100, rotationY: 52, rotationX: -16, transformPerspective: 1300 },
                          { z: 0, rotationY: -10, rotationX: 2, duration: .62, ease: E }, at);
    tl.to('.num' + n, { rotationY: -22, duration: .3, ease: N }, at + .62);
    tl.to('.num' + n, { z: 900, duration: .08, ease: N }, at + .92);
    tl.set('.num' + n, { autoAlpha: 0 }, at + 1);
  });

  tl.fromTo('#touch', { autoAlpha: 0, scale: 1.5 }, { autoAlpha: 1, scale: 1, duration: .28, ease: P }, .5);
  tl.to('#touch', { autoAlpha: 0, duration: .14, ease: N }, 3.68);
  tl.to('#float-press', { z: 22, duration: .2, ease: P }, .7);
  tl.to('#sos-btn', { scale: .95, duration: .2, ease: P }, .7);
  tl.fromTo('#sos-fill', { scale: .72 }, { scale: 1, duration: 3, ease: N }, .7);
  tl.to('.hint-idle', { autoAlpha: 0, duration: .15, ease: N }, .7);
  tl.fromTo('.hint-active', { autoAlpha: 0 }, { autoAlpha: 1, duration: .15, ease: N }, .7);
  [0, 1, 2].forEach(function (i) {
    tl.fromTo('#sos-halo', { scale: 1, opacity: .34 }, { scale: 1.34, opacity: 0, duration: 1, ease: P, immediateRender: false }, .7 + i);
    tl.fromTo('.r' + (i + 1), { scale: .12, opacity: .5 }, { scale: 1, opacity: 0, duration: 1.5, ease: P }, .9 + i);
  });
  tl.fromTo('#phone-base', { rotationZ: -.45 }, { rotationZ: .45, duration: .05, ease: N, repeat: 19, yoyo: true, immediateRender: false }, 2.7);
  tl.set('#phone-base', { rotationZ: 0 }, 3.7);
  tl.fromTo('#flood', { clipPath: 'circle(0px at 507px 670px)' }, { clipPath: 'circle(1620px at 507px 670px)', duration: 3, ease: 'power1.in' }, .7);
  tl.to('.hold-line', { autoAlpha: 0, duration: .18, ease: N }, 3.58);

  // ---- Beat 3: blur pull-out, the phone spins to the real next screen --------
  blurHit(3.7, '22 22', .3);
  cam(3.7, .85, E, { x: 0, y: 0, z: 0, rotationY: -6, rotationX: 4 });
  tl.to('#phone', { rotationY: 348, rotationX: 7, duration: .85, ease: P }, 3.7);
  tl.set('#scr-gate, #float-press', { autoAlpha: 0 }, 3.88);
  tl.set('#scr-report, #float-send', { autoAlpha: 1 }, 3.88);
  tl.to('#phone', { rotationY: 354, duration: .4, ease: N }, 4.55);

  tl.set('.loc-1', { autoAlpha: 1 }, 3.86);
  tl.fromTo('.loc-1', { z: -700, rotationY: 34, rotationX: -8, transformPerspective: 1300 },
                      { z: 0, rotationY: -8, rotationX: 2, duration: .75, ease: E }, 3.86);
  tl.to('.loc-1', { rotationY: -14, duration: .35, ease: N }, 4.6);
  tl.fromTo('.loc-2', { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .5, ease: E }, 4);
  tl.fromTo('.loc-3', { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .6, ease: E }, 4.2);
  rolls.forEach(function (_, i) {
    tl.set('.roll.r' + i, { autoAlpha: 1 }, 4 + i * .05);
    tl.set('.roll.r' + i, { autoAlpha: 0 }, 4.05 + i * .05);
  });
  tl.set('.roll.r' + rolls.length, { autoAlpha: 1 }, 4 + rolls.length * .05);

  tl.to('.strip-a', { autoAlpha: 0, duration: .12, ease: N }, 4.15);
  tl.fromTo('.strip-b', { autoAlpha: 0 }, { autoAlpha: 1, duration: .12, ease: N }, 4.15);
  tl.to('.strip-dot', { backgroundColor: '#22c55e', duration: .12, ease: N }, 4.15);

  // Push in on Send, tap it.
  cam(4.32, .42, P, { x: 165, y: -262, z: 320, rotationY: 8, rotationX: -5 });
  tl.set('#touch', { left: 207, top: 810 }, 4.3);
  tl.fromTo('#touch', { autoAlpha: 0, scale: 1.5 }, { autoAlpha: 1, scale: 1, duration: .2, ease: P, immediateRender: false }, 4.44);
  tl.to('#float-send', { z: 8, duration: .1, ease: P }, 4.62);
  tl.to('#float-send', { z: 30, duration: .16, ease: P }, 4.74);
  tl.to('.s-a', { autoAlpha: 0, duration: .08, ease: N }, 4.74);
  tl.fromTo('.s-b', { autoAlpha: 0 }, { autoAlpha: 1, duration: .08, ease: N }, 4.74);
  tl.to('#touch', { autoAlpha: 0, duration: .12, ease: N }, 4.82);

  // ---- Beat 4: whip with motion blur, the signal leads the camera ------------
  var FLY = { duration: .85, ease: E };
  blurHit(4.95, '46 0', .34);
  tl.to('.loc-1', { z: 700, duration: .14, ease: N }, 4.92);
  tl.set('.loc-1', { autoAlpha: 0 }, 5.06);
  tl.to('.loc-2, .loc-3', { autoAlpha: 0, duration: .16, ease: N }, 4.92);
  tl.to('#world', Object.assign({ x: -1920 }, FLY), 4.95);
  cam(4.95, .38, P, { x: 0, y: 0, z: -300, rotationY: -26, rotationX: 10 });
  cam(5.33, .72, E, { z: 0, rotationY: 7, rotationX: 2 });
  tl.to('#phone', { rotationY: 430, duration: .5, ease: P }, 4.95);
  tl.set('#win-3d, #adm-copy', { autoAlpha: 1 }, 4.95);
  tl.set('#phone-in', { autoAlpha: 0 }, 5.5);
  tl.fromTo('#win-3d', { rotationY: -62, rotationX: 14, z: -560 }, { rotationY: 0, rotationX: 0, z: 0, duration: .95, ease: E }, 4.95);
  tl.set('.comet, #head', { autoAlpha: 1 }, 4.95);
  tl.fromTo('.comet', { attr: { 'stroke-dashoffset': .42 } }, Object.assign({ attr: { 'stroke-dashoffset': -.58 } }, FLY), 4.95);
  tl.fromTo('#head', { offsetDistance: '0%' }, Object.assign({ offsetDistance: '100%' }, FLY), 4.95);
  tl.to('#head, .comet', { autoAlpha: 0, duration: .3, ease: N }, 5.72);

  // ---- Beat 5: impact, the alert flies off the screen toward camera ----------
  tl.fromTo('#win', { z: -80, rotationX: 5 }, { z: 0, rotationX: 0, duration: .6, ease: E, immediateRender: false }, 5.72);
  tl.fromTo('#wash', { clipPath: 'circle(0px at 480px 540px)' }, { clipPath: 'circle(1700px at 480px 540px)', duration: .8, ease: E }, 5.68);
  tl.to('#stat-sos .n0', { autoAlpha: 0, duration: .06, ease: N }, 5.78);
  tl.fromTo('#stat-sos .n1', { autoAlpha: 0 }, { autoAlpha: 1, duration: .06, ease: N }, 5.78);
  tl.to('#stat-sos', { borderColor: '#dc2626', backgroundColor: '#fef2f2', duration: .15, ease: N }, 5.78);

  tl.fromTo('#backdrop', { autoAlpha: 0 }, { autoAlpha: 1, duration: .28, ease: P }, 5.95);
  tl.to('.portal', { filter: 'blur(7px)', duration: .28, ease: P }, 5.95);
  tl.fromTo('#panel', { z: 175, y: 40, rotationX: 20, rotationY: -14, scale: .72, autoAlpha: 0 },
                      { z: 64, y: 0, rotationX: 0, rotationY: 0, scale: 1.18, autoAlpha: 1, duration: .9, ease: E }, 6);
  tl.fromTo('.p-row', { z: -70, y: 16, autoAlpha: 0 }, { z: 12, y: 0, autoAlpha: 1, duration: .65, ease: E, stagger: .1 }, 6.22);
  tl.fromTo('.cell', { z: -90, y: 14, autoAlpha: 0 }, { z: 30, y: 0, autoAlpha: 1, duration: .65, ease: E, stagger: .09 }, 6.5);
  tl.fromTo('#panel', { boxShadow: '0 30px 80px rgba(15,23,42,.34), 0 0 0 1px rgba(220,38,38,.55), 0 0 24px rgba(220,38,38,.22)' },
            { boxShadow: '0 30px 80px rgba(15,23,42,.34), 0 0 0 2px rgba(220,38,38,.9), 0 0 64px rgba(220,38,38,.6)', duration: .6, ease: 'sine.inOut', yoyo: true, repeat: 5, immediateRender: false }, 6.4);
  tl.fromTo('.p-eyebrow span', { boxShadow: '0 0 0 2px rgba(220,38,38,.3)' }, { boxShadow: '0 0 0 8px rgba(220,38,38,.04)', duration: .6, ease: 'sine.inOut', yoyo: true, repeat: 5 }, 6.4);

  tl.fromTo('.adm-eyebrow', { y: 24, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .75, ease: E }, 6.2);
  tl.fromTo('.ln', { rotationX: -82, z: -60, autoAlpha: 0, transformOrigin: '50% 100%', transformPerspective: 900 },
                   { rotationX: 0, z: 0, autoAlpha: 1, duration: .75, ease: E, stagger: .11 }, 6.3);

  // Camera keeps orbiting, then drives in on the precinct and the button.
  cam(6.05, 1.9, N, { x: 0, y: 0, z: 40, rotationY: -2, rotationX: 3 });
  tl.to('#win-3d', { rotationY: 5, rotationX: -2, duration: 1.9, ease: N }, 6.05);
  cam(7.95, .7, P, { x: -24, y: -8, z: 56, rotationY: -6, rotationX: 4 });
  cam(8.65, 1.35, N, { x: -30, y: -10, z: 70, rotationY: -8, rotationX: 4 });
  tl.to('#nearest', { borderColor: '#2563eb', boxShadow: '0 0 0 4px rgba(37,99,235,.2), 0 10px 24px rgba(37,99,235,.12)', duration: .3, ease: P }, 7.85);
  tl.fromTo('#cursor', { x: 170, y: 120, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: .85, ease: E }, 8.2);
  tl.to('#assign', { backgroundColor: '#b91c1c', duration: .18, ease: N }, 8.85);

  tl.set({}, {}, 10);
  window.__mainTimeline = tl;
})();
