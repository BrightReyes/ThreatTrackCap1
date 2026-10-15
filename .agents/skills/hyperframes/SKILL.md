---
name: hyperframes
description: Complete guide and workflow for HeyGen HyperFrames — turning HTML, CSS, media, and seekable GSAP/Web animations into deterministic broadcast-quality MP4 video. Use whenever authoring, previewing, checking, or rendering HyperFrames compositions.
---

# HyperFrames Video Engineering & Deterministic Rendering Skill

## 1. Overview & Architecture
HyperFrames is an open-source framework by HeyGen for turning standard web technologies (HTML, CSS, WebGL, Canvas, SVGs, audio) and seekable animations into deterministic MP4 videos.

### Core Architecture
- **Seekable Determinism:** Video frames are captured frame-by-frame at an exact FPS (typically 30 or 60 fps). All motion must be driven by deterministic, seekable time (e.g. GSAP timeline `tl.pause(t)` or CSS animations synchronized to master composition time). Never use non-deterministic `setInterval`, `Math.random()`, or unsynced `requestAnimationFrame` for timeline progression.
- **Hardware-Accelerated WebGL/GPU Pipeline:** Headless Chromium captures DOM states with WebGL shaders, ANGLE/Direct3D acceleration, and injected deterministic fonts.
- **Strict Linting Engine:** HyperFrames features an automated static/dynamic analyzer (`hyperframes check`) verifying DOM structure, layout containment, WCAG contrast, motion performance, and snapshot regressions.

---

## 2. Composition Data Attributes (`index.html`)

Every HyperFrames root and timeline element must define declarative metadata:

```html
<!DOCTYPE html>
<html lang="en" data-resolution="landscape">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Promo Video</title>
    <script src="assets/gsap.min.js"></script>
    <link rel="stylesheet" href="assets/style.css">
    <script src="timeline.js"></script>
    <script type="module" src="assets/anim.js"></script>
  </head>
  <body>
    <!-- Root Composition -->
    <div id="root"
         data-composition-id="main"
         data-start="0"
         data-duration="62"
         data-width="1920"
         data-height="1080">

      <!-- Scene Elements -->
      <section id="s1"
               class="clip scene"
               data-start="0"
               data-duration="3.2"
               data-track-index="1">
        ...
      </section>

      <section id="s2"
               class="clip scene"
               data-start="3.2"
               data-duration="2.2"
               data-track-index="2">
        ...
      </section>
    </div>
  </body>
</html>
```

### Essential Attributes
- `data-composition-id`: Identifier for the master or sub-composition (e.g., `main`).
- `data-start`: Start time in seconds along the master timeline.
- `data-duration`: Active duration of the element in seconds.
- `data-track-index`: Visual track layer (higher numbers sit on top of lower numbers).
- `data-composition-src`: Path to modular sub-composition HTML files (used for breaking complex scenes into standalone files).

### Layout Exception Directives
When elements intentionally overflow or overlap, declare explicit waiver attributes so `hyperframes check` remains clean:
- `data-layout-allow-overflow="true"`: Disables container escape & canvas overflow warnings for intentional bleed, floating cards, or shockwaves.
- `data-layout-allow-overlap="true"`: Disables text collision warnings for intentional artistic layering (e.g., titles over blurred background networks).
- `data-layout-allow-occlusion="true"`: Disables warnings when an element is intentionally masked or occluded.

---

## 3. CLI Commands & Workflow

Add these scripts to `package.json`:

```json
{
  "scripts": {
    "dev": "npx --yes hyperframes@latest preview --foreground",
    "check": "npx --yes hyperframes@latest check",
    "render": "npx --yes hyperframes@latest render",
    "publish": "npx --yes hyperframes@latest publish"
  }
}
```

### 1. `npx hyperframes preview`
- Starts an interactive local preview player with timeline scrub controls, frame counter, play/pause, volume, and hot reloading.
- Use `--foreground` to keep the process interactive.

### 2. `npx hyperframes check`
Audits the live timeline across 4 verification domains:
1. **Structure:** Verifies timeline elements, composition attributes, and sub-composition hierarchy.
2. **Runtime:** Catches unhandled JavaScript exceptions, missing GSAP targets, and broken asset URLs.
3. **Layout:** Mathematical bounding box checks detecting escaped containers, text overlaps, and off-canvas clipping.
4. **Contrast:** Evaluates foreground vs. background luminance across every rendered frame (WCAG 4.5:1 for body text, 3:1 for large text).

### 3. `npx hyperframes render`
- Renders an exact, frame-perfect, deterministic `.mp4` video with audio muxing.
- Supports `--fps <30|60>`, `--quality <crf>`, `--scale <1|2>`.

---

## 4. GSAP Animation Integration

To ensure full compatibility with the HyperFrames timeline scrubbing and frame renderer:

```javascript
// Expose the master timeline on window so HyperFrames can seek deterministically
const masterTimeline = gsap.timeline({ paused: true });
window.masterTimeline = masterTimeline;

// Build scene timelines in chronological order
function buildAnimation() {
  // S1 (0.0s - 3.2s)
  masterTimeline.fromTo("#s1-title", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, 0.2);

  // S2 (3.2s - 5.4s)
  masterTimeline.fromTo("#s2-card", { opacity: 0, scale: 0.95 }, { opacity: 1, scale: 1, duration: 0.8, ease: "power3.out" }, 3.3);
}

buildAnimation();
```

---

## 5. Best Practices & Rules of Thumb
1. **Resolution & Safe Margins:** Default to `1920x1080`. Keep critical text and UI inside a 120px safe title margin (`left >= 120px`, `right <= 1800px`, `top >= 100px`, `bottom <= 980px`).
2. **Never Break 2-Column Layouts with `.camera-rig`:** Keep `.camera-rig` as `position: absolute; inset: 0; width: 1920px; height: 1080px; display: block !important; transform-style: flat;`. Use explicit CSS Grid or side-by-side positioning for scene columns.
3. **Z-Index Layer Hierarchy:**
   - `z-index: 1`: Background canvas, grids, SVG connector lines.
   - `z-index: 10`: Foreground UI cards (with solid opaque backgrounds like `#ffffff` or `#0f172a`).
   - `z-index: 20`: Overlays, floating badges, cursor trackers, HUD status bars.
4. **Run `npm run check` after every edit:** Ensure 0 errors and 0 runtime exceptions before marking work complete.
