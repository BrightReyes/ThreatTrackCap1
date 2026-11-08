// Timeline for the ThreatTrack SaaS demo. All times are seconds on the voiceover.
(function () {
  var P = 'power3.out', E = 'expo.out', N = 'none';
  var tl = gsap.timeline({ paused: true });
  var q = function (s) { return document.querySelector(s); };
  function show(s, t) { tl.set(s, { autoAlpha: 1 }, t); }
  function hide(s, t, d) { tl.to(s, { autoAlpha: 0, duration: d || .15, ease: N }, t); }
  function rise(s, t, d) { tl.fromTo(s, { y: 28, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: d || .55, ease: E }, t); }
  function pop(s, t, d, stag) { tl.fromTo(s, { z: -420, rotationX: 22, rotationY: -14, autoAlpha: 0, transformPerspective: 1300 }, { z: 0, rotationX: 0, rotationY: 0, autoAlpha: 1, duration: d || .6, ease: E, stagger: stag || 0 }, t); }
  function stamp(s, t) { tl.fromTo(s, { scale: 1.9, rotation: -8, autoAlpha: 0 }, { scale: 1, rotation: 0, autoAlpha: 1, duration: .32, ease: E }, t); }
  function draw(s, t, d) { tl.fromTo(s, { attr: { 'stroke-dashoffset': 1 } }, { attr: { 'stroke-dashoffset': 0 }, duration: d || .6, ease: P }, t); }
  function roll(s, t, step) { var sp = document.querySelectorAll(s + ' > span'); sp.forEach(function (e, i) { tl.set(e, { autoAlpha: 1 }, t + i * step); if (i < sp.length - 1) tl.set(e, { autoAlpha: 0 }, t + (i + 1) * step); }); }
  function blur(t, peak) {
    tl.set('#root', { filter: 'url(#mb)' }, t - .1);
    tl.fromTo('#mbf', { attr: { stdDeviation: '0 0' } }, { attr: { stdDeviation: peak || '46 0' }, duration: .1, ease: N, immediateRender: false }, t - .1);
    tl.to('#mbf', { attr: { stdDeviation: '0 0' }, duration: .28, ease: P }, t);
    tl.set('#root', { filter: 'none' }, t + .3);
  }
  // Camera path for one scene: fly in, keep drifting, whip out.
  function cam(id, t0, t1, a, opts) {
    var o = opts || {}, r = '#' + id + ' .rig';
    gsap.set(r, { transformOrigin: '960px 540px', rotationY: a, rotationX: o.rx0 == null ? 12 : o.rx0, z: o.z0 == null ? -520 : o.z0 });
    tl.to(r, { rotationY: a * .32, rotationX: 3, z: 0, duration: .85, ease: E }, t0);
    tl.to(r, { rotationY: -a * .32, rotationX: 5, z: o.z1 == null ? 90 : o.z1, duration: Math.max(.2, t1 - t0 - 1.03), ease: N }, t0 + .85);
    tl.to(r, { rotationY: -a * 1.5, z: 420, duration: .18, ease: 'power2.in' }, t1 - .18);
    blur(t1);
  }
  function cursor(s, t, x, y) { tl.fromTo(s, { x: x || 190, y: y || 130, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: .55, ease: E }, t); }
  function phoneIn(s, t, ry, end) { gsap.set(s + ' .ph-base', { scale: .9 }); tl.fromTo(s + ' .ph', { rotationY: ry, rotationX: 20, rotationZ: -7, z: -340 }, { rotationY: end, rotationX: 4, rotationZ: 0, z: 0, duration: .9, ease: E }, t); }
  function flood(sel, t, d, r, cx, cy, from) { tl.fromTo(sel, { clipPath: 'circle(' + (from || 0) + 'px at ' + cx + 'px ' + cy + 'px)' }, { clipPath: 'circle(' + r + 'px at ' + cx + 'px ' + cy + 'px)', duration: d, ease: 'power1.in', immediateRender: from == null }, t); }
  function comet(s, t, d) { tl.set(s + ' .cm', { autoAlpha: 1 }, t); tl.fromTo(s + ' .cm', { attr: { 'stroke-dashoffset': .42 } }, { attr: { 'stroke-dashoffset': -.58 }, duration: d, ease: E }, t); }

  // S1 hook 0 - 4.62
  gsap.set('#s1 .flood', { clipPath: 'circle(0px at 460px 670px)' });
  cam('s1', 0, 4.62, 16);
  phoneIn('#s1', 0, -68, 14);
  gsap.set('#s1 .fp', { z: 44 }); gsap.set('#s1 .touch', { z: 34 }); gsap.set('#s1 .fs', { z: 30 });
  tl.fromTo('#s1 .touch', { autoAlpha: 0, scale: 1.5 }, { autoAlpha: 1, scale: 1, duration: .2, ease: P }, .25);
  tl.fromTo('#s1 .fill', { scale: .72 }, { scale: 1, duration: 1.35, ease: N }, .4);
  flood('#s1 .flood', .4, 1.4, 1700, 460, 670);
  tl.set('#s1 .hint.h1', { autoAlpha: 0 }, .4); show('#s1 .hint.h2', .4);
  rise('#s1 .l1', .78);
  hide('#s1 .touch', 1.72, .1);
  tl.to('#s1 .ph', { rotationY: 374, duration: .7, ease: P }, 1.75);
  tl.set('#s1 .sg, #s1 .fp', { autoAlpha: 0 }, 1.92); show('#s1 .sr, #s1 .fs', 1.92);
  rise('#s1 .l2', 1.86);
  tl.set('#s1 .touch', { left: 207, top: 810 }, 2.2);
  tl.fromTo('#s1 .touch', { autoAlpha: 0, scale: 1.5 }, { autoAlpha: 1, scale: 1, duration: .14, ease: P, immediateRender: false }, 2.3);
  hide('#s1 .touch', 2.62, .1);
  tl.set('#s1 .s1', { autoAlpha: 0 }, 2.75); show('#s1 .s2', 2.75); tl.set('#s1 .sd', { backgroundColor: '#22c55e' }, 2.75);
  rise('#s1 .l3', 2.96);

  // S2 one photo 4.62 - 7.45
  cam('s2', 4.62, 7.45, -14, { z1: 50 });
  phoneIn('#s2', 4.62, 60, 12);
  tl.fromTo('#s2 .win3', { rotationY: -44, rotationX: 10, z: -300 }, { rotationY: -5, rotationX: 2, z: 0, duration: .9, ease: E }, 4.62);
  rise('#s2 .k1', 4.72);
  tl.fromTo('#s2 .flash', { opacity: .95 }, { opacity: 0, duration: .35, ease: P }, 4.95);
  show('#s2 .flyp', 5.45);
  tl.fromTo('#s2 .flyp', { x: 0, y: 0, scale: .9, rotation: -4 }, { x: 790, y: -150, z: 170, scale: 1.75, rotation: 0, duration: .75, ease: E }, 5.45);
  rise('#s2 .k2', 5.7);

  // S3 SOS 7.45 - 16.05
  gsap.set('#s3 .flood', { clipPath: 'circle(0px at 500px 670px)' });
  cam('s3', 7.45, 16.05, 14, { z1: 40 });
  phoneIn('#s3', 7.45, -60, 14);
  gsap.set('#s3 .fp', { z: 44 }); gsap.set('#s3 .touch', { z: 34 }); gsap.set('#s3 .fs', { z: 30 });
  rise('#s3 .hl', 7.6);
  tl.fromTo('#s3 .touch', { autoAlpha: 0, scale: 1.5 }, { autoAlpha: 1, scale: 1, duration: .2, ease: P }, 7.55);
  tl.fromTo('#s3 .fill', { scale: .72 }, { scale: .92, duration: 2.1, ease: N }, 7.75);
  tl.set('#s3 .h1', { autoAlpha: 0 }, 7.75); show('#s3 .h2', 7.75);
  [3, 2, 1].forEach(function (n, i) {
    var t = 8.0 + i * .55;
    show('#s3 .n' + n, t);
    tl.fromTo('#s3 .n' + n, { z: -1000, rotationY: 52, rotationX: -16, transformPerspective: 1300 }, { z: 0, rotationY: -10, rotationX: 2, duration: .42, ease: E }, t);
    tl.to('#s3 .n' + n, { z: 900, duration: .08, ease: N }, t + .47);
    tl.set('#s3 .n' + n, { autoAlpha: 0 }, t + .55);
  });
  flood('#s3 .flood', 7.75, 1.95, 760, 500, 670);
  // Release: everything snaps back.
  hide('#s3 .touch', 9.8, .08); hide('#s3 .hl', 9.75, .12);
  tl.to('#s3 .fill', { scale: .72, duration: .2, ease: P }, 9.85);
  tl.to('#s3 .flood', { clipPath: 'circle(0px at 500px 670px)', duration: .3, ease: P }, 9.85);
  tl.set('#s3 .h2', { autoAlpha: 0 }, 9.85); show('#s3 .h1', 9.85);
  pop('#s3 .cn', 10.0, .5);
  hide('#s3 .cn', 11.3, .12);
  // Second hold commits.
  tl.fromTo('#s3 .touch', { autoAlpha: 0 }, { autoAlpha: 1, duration: .1, ease: N, immediateRender: false }, 11.4);
  pop('#s3 .kh', 11.46, .45); hide('#s3 .kh', 12.15, .1);
  tl.to('#s3 .fill', { scale: 1, duration: .8, ease: N }, 11.46);
  tl.set('#s3 .h1', { autoAlpha: 0 }, 11.46); show('#s3 .h2', 11.46);
  flood('#s3 .flood', 11.46, .8, 1700, 500, 670, 0);
  hide('#s3 .touch', 12.2, .08);
  tl.to('#s3 .ph', { rotationY: 354, duration: .7, ease: P }, 12.24);
  tl.set('#s3 .sg, #s3 .fp', { autoAlpha: 0 }, 12.42); show('#s3 .sr, #s3 .fs', 12.42);
  pop('#s3 .cf', 12.42, .4);
  tl.set('#s3 .touch', { left: 207, top: 810 }, 12.6);
  tl.fromTo('#s3 .touch', { autoAlpha: 0, scale: 1.5 }, { autoAlpha: 1, scale: 1, duration: .14, ease: P, immediateRender: false }, 12.8);
  tl.to('#s3 .fs', { z: 8, duration: .08, ease: P }, 13); tl.to('#s3 .fs', { z: 30, duration: .14, ease: P }, 13.1);
  hide('#s3 .touch', 13.2, .08); hide('#s3 .cf', 13.42, .1);
  tl.set('#s3 .s1', { autoAlpha: 0 }, 13.4); show('#s3 .s2', 13.4); tl.set('#s3 .sd', { backgroundColor: '#22c55e' }, 13.4);
  pop('#s3 .lc1', 13.5, .5); show('#s3 .lc2', 13.7); roll('#s3 .co', 13.7, .08); rise('#s3 .lc3', 14.05);
  comet('#s3', 14.76, .9);

  // S4 report 16.05 - 24.25
  cam('s4', 16.05, 24.25, -12, { z1: 60 });
  phoneIn('#s4', 16.05, 60, -14);
  rise('#s4 .e1', 16.15);
  var cts = []; for (var c = 0; c < 10; c++) cts.push('#s4 .ct' + c);
  tl.fromTo(cts.join(','), { z: -500, rotationY: 40, rotationX: 18, autoAlpha: 0, transformPerspective: 1400 }, { z: 0, rotationY: 0, rotationX: 0, autoAlpha: 1, duration: .5, ease: E, stagger: .1 }, 16.75);
  tl.to(cts.join(','), { z: 340, autoAlpha: 0, duration: .22, ease: N, stagger: .012 }, 18.32);
  hide('#s4 .e1', 18.32, .15);
  pop('#s4 .rv1', 18.5, .5); pop('#s4 .rv2', 18.65, .5);
  tl.to('#s4 .rv1', { borderColor: '#dc2626', backgroundColor: '#fef2f2', scale: 1.04, duration: .2, ease: P }, 19.24);
  tl.to('#s4 .rv1', { borderColor: '#e2e8f0', backgroundColor: '#ffffff', scale: 1, duration: .2, ease: P }, 19.86);
  tl.to('#s4 .rv2', { borderColor: '#dc2626', backgroundColor: '#fef2f2', scale: 1.04, duration: .2, ease: P }, 19.86);
  tl.set('#s4 .rw', { backgroundColor: '#dc2626', color: '#fff', borderColor: '#dc2626' }, 19.86);
  hide('#s4 .rv1, #s4 .rv2', 20.32, .14);
  show('#s4 .ph1', 20.5);
  tl.fromTo('#s4 .ph1', { z: -600, rotationY: 30, rotationX: 10, transformPerspective: 1400 }, { z: 0, rotationY: 0, rotationX: 0, duration: .5, ease: E }, 20.5);
  tl.fromTo('#s4 .fl2', { opacity: 1 }, { opacity: 0, duration: .4, ease: P }, 20.86);
  show('#s4 .pshot', 20.92);
  rise('#s4 .sz', 21.3);
  roll('#s4 .szr', 21.42, .22);
  tl.fromTo('#s4 .szb', { scaleX: 1 }, { scaleX: .13, duration: .9, ease: P }, 21.42);
  rise('#s4 .up', 23.1);

  // S5 routing 24.25 - 30.55
  gsap.set('#s5 .mp', { transformOrigin: '50% 50%' });
  cam('s5', 24.25, 30.55, 18, { rx0: 18, z1: 90 });
  tl.fromTo('#s5 .pu', { y: -280, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .55, ease: 'power3.out' }, 24.9);
  tl.fromTo('#s5 .uring', { scale: .2, opacity: .8 }, { scale: 1.6, opacity: 0, duration: 1.1, ease: P, repeat: 3 }, 25.3);
  rise('#s5 .gc', 25.6); roll('#s5 .co', 25.75, .14);
  pop('#s5 .pb', 26.86, .45); pop('#s5 .pm', 26.95, .45);
  draw('#s5 .rt2', 27.1, .55); draw('#s5 .rt1', 27.2, .5);
  tl.to('#s5 .rt2', { opacity: .35, duration: .25, ease: N }, 28.16);
  hide('#s5 .pm', 28.16, .2);
  pop('#s5 .nc', 28.16, .5); rise('#s5 .oc', 28.3);
  rise('#s5 .fs1', 28.88);
  show('#s5 .unit', 29.1);
  var G = window.mapGeo;
  tl.fromTo('#s5 .unit', { attr: { cx: G.bal[0], cy: G.bal[1] } }, { attr: { cx: G.user[0], cy: G.user[1] }, duration: 1.3, ease: 'power1.inOut' }, 29.1);

  // S6 interrupt 30.55 - 36.1
  function winIn(id, t) { gsap.set('#' + id + ' .win3', { scale: .96 }); tl.fromTo('#' + id + ' .win3', { rotationY: -44, rotationX: 10, z: -300 }, { rotationY: -2, rotationX: 2, z: 0, duration: .9, ease: E }, t); }
  cam('s6', 30.55, 36.1, 16, { z1: 40 });
  winIn('s6', 30.55);
  tl.fromTo('#s6 .bd', { autoAlpha: 0 }, { autoAlpha: 1, duration: .2, ease: P }, 31.05);
  tl.set('#s6 .portal', { filter: 'blur(7px)' }, 31.1);
  gsap.set('#s6 .panel', { autoAlpha: 0 });
  tl.fromTo('#s6 .panel', { z: 175, y: 40, rotationX: 20, rotationY: -14, scale: .72, autoAlpha: 0 }, { z: 60, y: 0, rotationX: 0, rotationY: 0, scale: 1.14, autoAlpha: 1, duration: .75, ease: E }, 31.1);
  rise('#s6 .ae', 31.3);
  tl.fromTo('#s6 .ln', { rotationX: -82, z: -60, autoAlpha: 0, transformOrigin: '50% 100%', transformPerspective: 900 }, { rotationX: 0, z: 0, autoAlpha: 1, duration: .65, ease: E, stagger: .1 }, 31.4);
  gsap.set('#s6 .ttl, #s6 .c1, #s6 .c2, #s6 .c3, #s6 .c4', { autoAlpha: 0 });
  rise('#s6 .c1', 31.9); rise('#s6 .c2', 33.1); roll('#s6 .loc', 33.1, .92);
  tl.fromTo('#s6 .c2', { boxShadow: '0 0 0 0 rgba(220,38,38,0)' }, { boxShadow: '0 0 0 4px rgba(220,38,38,.5)', duration: .3, ease: P, immediateRender: false }, 33.32);
  rise('#s6 .c3', 34.5); rise('#s6 .c4', 34.6);
  tl.fromTo('#s6 .ttl', { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: .45, ease: E }, 34.8);

  // S7 dispatch 36.1 - 40
  cam('s7', 36.1, 40, -10, { z0: -120, rx0: 5, z1: 60 });
  gsap.set('#s7 .win3', { scale: .96 }); gsap.set('#s7 .panel', { z: 60, scale: 1.14 });
  tl.set('#s7 .portal', { filter: 'blur(7px)' }, 36.1);
  roll('#s7 .loc', 36.1, 0);
  gsap.set('#s7 .dd', { autoAlpha: 0 });
  pop('#s7 .dd', 36.3, .35);
  rise('#s7 .k7a', 36.3);
  hide('#s7 .k7a', 37.65, .1); hide('#s7 .dd', 37.45, .12);
  pop('#s7 .k7b', 37.75, .35);
  tl.fromTo('#s7 .cur', { x: 190, y: 130, autoAlpha: 0 }, { x: 0, y: 0, autoAlpha: 1, duration: .4, ease: E }, 37.5);
  tl.to('#s7 .pri', { scale: .94, duration: .07, ease: P }, 38.0);
  tl.to('#s7 .pri', { scale: 1, backgroundColor: '#b91c1c', duration: .14, ease: P }, 38.1);
  hide('#s7 .k7b', 39.25, .1);
  pop('#s7 .ok', 38.9, .4);

  // S8 ratings 40 - 45.3
  cam('s8', 40, 45.3, 12, { z1: 40 });
  rise('#s8 .k8a', 40.1);
  pop('#s8 .rw0', 40.7, .5); stamp('#s8 .rw0 .stp', 41.45);
  pop('#s8 .rw1', 42.1, .4); pop('#s8 .rw2', 42.6, .4);
  stamp('#s8 .rw1 .stp', 43.4); stamp('#s8 .rw2 .stp', 43.5);

  // S9 help 45.3 - 53.45
  cam('s9', 45.3, 53.45, -14, { z1: 50 });
  phoneIn('#s9', 45.3, 56, -14);
  show('#s9 .dim', 46.4); pop('#s9 .pp', 46.45, .5);
  rise('#s9 .k9a', 46.5);
  rise('#s9 .k9b', 47.9); roll('#s9 .et', 49.05, .16);
  hide('#s9 .pp, #s9 .dim', 50.4, .15); hide('#s9 .k9a, #s9 .k9b', 50.4, .15);
  pop('#s9 .trk', 50.5, .4);
  var steps = [50.86, 51.3, 51.74, 52.2, 53.0];
  document.querySelectorAll('#s9 .step').forEach(function (e, i) {
    tl.to(e, { color: '#0f172a', duration: .1, ease: N }, steps[i]);
    tl.to(e.querySelector('.dot'), { backgroundColor: e.querySelector('.dot').dataset.c, scale: 1.2, duration: .14, ease: P }, steps[i]);
    tl.to(e.querySelector('.dot'), { scale: 1, duration: .18, ease: P }, steps[i] + .15);
  });

  // S10 map 53.45 - 62.25
  cam('s10', 53.45, 62.25, 14, { z1: 50 });
  phoneIn('#s10', 53.45, -60, 6);
  for (var h = 0; h < 7; h++) tl.fromTo('#s10 .hs' + h, { scale: 0 }, { scale: 1, duration: .5, ease: E }, 55.8 + h * .16);
  rise('#s10 .ka', 55.5); rise('#s10 .kb', 56.4);
  tl.set('#s10 .c24', { backgroundColor: '#eef2f6', color: '#334155' }, 57.6); tl.set('#s10 .c7', { backgroundColor: '#dc2626', color: '#fff' }, 57.6);
  tl.set('#s10 .c7', { backgroundColor: '#eef2f6', color: '#334155' }, 58.3); tl.set('#s10 .c30', { backgroundColor: '#dc2626', color: '#fff' }, 58.3);
  pop('#s10 .ca', 59.15, .5); pop('#s10 .cb', 60.0, .5); pop('#s10 .kc', 61.0, .4);

  // S11 analytics 62.25 - 66.65
  cam('s11', 62.25, 66.65, -12, { z1: 40 });
  tl.fromTo('#s11 .win3', { z: -200 }, { z: 0, duration: .8, ease: E }, 62.25);
  tl.fromTo('#s11 .bar', { scaleY: 0 }, { scaleY: 1, duration: .5, ease: E, stagger: .04 }, 62.45);
  cursor('#s11 .cur', 63.0);
  tl.to('#s11 .gen', { scale: .94, duration: .07, ease: P }, 63.7);
  tl.to('#s11 .gen', { scale: 1, duration: .14, ease: P }, 63.78);
  rise('#s11 .ap1', 64.2); pop('#s11 .ap2', 64.6, .45); pop('#s11 .ap3', 65.05, .45); pop('#s11 .ap4', 65.5, .45);

  // S12 AI management 66.65 - 70.35
  cam('s12', 66.65, 70.35, 10, { z0: -260, z1: 40 });
  tl.set('#s12 .a1 > span:first-child, #s12 .a2 > span:first-child', { autoAlpha: 1 }, 66.65);
  rise('#s12 .nw', 68.5); tl.set('#s12 .a1 > span:first-child', { autoAlpha: 0 }, 68.5); show('#s12 .a1 > span:last-child', 68.5);
  tl.set('#s12 .t1', { backgroundColor: '#eef2f6', color: '#64748b' }, 69.4); tl.set('#s12 .t2', { backgroundColor: '#0f172a', color: '#fff' }, 69.4);
  tl.set('#s12 .tb1', { autoAlpha: 0 }, 69.4); show('#s12 .tb2', 69.4);
  rise('#s12 .nw2', 69.65); tl.set('#s12 .a2 > span:first-child', { autoAlpha: 0 }, 69.65); show('#s12 .a2 > span:last-child', 69.65);

  // S13 RAG 70.35 - 75.45
  cam('s13', 70.35, 75.45, -16, { z1: 50 });
  rise('#s13 .k13', 70.45);
  pop('#s13 .n1', 71.2, .5); pop('#s13 .n2', 71.8, .5);
  draw('#s13 .rga', 72.0, .5); draw('#s13 .rgb', 72.4, .5);
  rise('#s13 .dl', 72.4);
  pop('#s13 .n3', 73.3, .5); draw('#s13 .rgc', 73.5, .4);
  document.querySelectorAll('#s13 .doc').forEach(function (e, i) {
    if (e.dataset.top === '1') tl.to(e, { borderColor: '#dc2626', backgroundColor: '#fef2f2', color: '#991b1b', x: 14, duration: .25, ease: P }, 73.88 + i * .1);
    else tl.to(e, { autoAlpha: .32, duration: .25, ease: N }, 73.88);
  });

  // S14 human decision 75.45 - 85.95
  cam('s14', 75.45, 85.95, 12, { z1: 50 });
  tl.fromTo('#s14 .plan', { rotationY: 26, rotationX: 8, z: -320 }, { rotationY: -5, rotationX: 2, z: 0, duration: .9, ease: E }, 75.45);
  rise('#s14 .o1', 76.5);
  rise('#s14 .cits', 77.1);
  pop('#s14 .rowa', 78.1, .45); pop('#s14 .rowb', 79.4, .45);
  hide('#s14 .o1', 80.3, .12);
  pop('#s14 .o2', 80.45, .5);
  stamp('#s14 .adv', 81.4);
  rise('#s14 .o3', 82.48);
  rise('#s14 .o4', 83.2);
  stamp('#s14 .lk', 84.0);
  pop('#s14 .hd', 85.0, .4);

  // S15 title 85.95 - 95
  gsap.set('#s15 .rig', { transformOrigin: '960px 540px', rotationX: 8, z: -260 });
  tl.to('#s15 .rig', { rotationX: 0, z: 0, duration: 3.2, ease: P }, 85.95);
  pop('#s15 .z1', 86.34, .45);
  pop('#s15 .z2', 88.0, .4);
  hide('#s15 .z1, #s15 .z2', 89.2, .22);
  show('#s15 .sig0', 88.8);
  tl.fromTo('#s15 .sig0', { x: -620, y: 480, scale: .6 }, { x: 0, y: 0, scale: 1.3, duration: .6, ease: E }, 88.8);
  tl.to('#s15 .sig0', { scale: 2.4, autoAlpha: 0, duration: .24, ease: N }, 89.42);
  var sh = [['.s-a', -520, -340], ['.s-b', -700, 320], ['.s-c', 720, 300]];
  sh.forEach(function (s) {
    show('#s15 ' + s[0], 89.05);
    tl.fromTo('#s15 ' + s[0], { x: s[1], y: s[2], z: -1100, rotationX: 200, rotationY: 240, rotationZ: 90 }, { x: 0, y: 0, z: 0, rotationX: 0, rotationY: 0, rotationZ: 0, duration: .62, ease: E }, 89.05);
  });
  gsap.set('#s15 .logo3', { transformOrigin: '50% 50%' });
  tl.fromTo('#s15 .logo3', { rotationY: -30 }, { rotationY: 0, duration: 1, ease: E }, 89.05);
  show('#s15 .shk', 89.62);
  tl.fromTo('#s15 .shk', { scale: .08, opacity: .95 }, { scale: 1.9, opacity: 0, duration: .9, ease: E }, 89.62);
  tl.fromTo('#s15 .ch', { y: 60, rotationX: -90, autoAlpha: 0, transformPerspective: 700 }, { y: 0, rotationX: 0, autoAlpha: 1, duration: .55, ease: E, stagger: .032 }, 89.74);
  tl.fromTo('#s15 .tg', { y: 26, autoAlpha: 0, letterSpacing: '.16em' }, { y: 0, autoAlpha: 1, letterSpacing: '0em', duration: .85, ease: E }, 90.68);
  tl.to('#s15 .rig', { z: 60, duration: 4.6, ease: N }, 90.4);
  tl.fromTo('#s15 .blk', { autoAlpha: 0 }, { autoAlpha: 1, duration: .85, ease: N }, 94.15);

  tl.set({}, {}, 95);
  window.__mainTimeline = tl;
})();
