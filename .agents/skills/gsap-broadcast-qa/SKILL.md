---
name: gsap-broadcast-qa
description: Broadcast-grade 1920x1080 GSAP promo video cinematography, layout geometry enforcement, contrast auditing, card density balancing, and voiceover-to-timeline synchronization. Use whenever editing index.html, assets/style.css, timeline.js, assets/anim.js, or audio/*.json.
---

# GSAP Broadcast Promo Video Director & QA Skill

## 1. MANDATORY PRE-EDIT CHECKS (NEVER GUESS SELECTORS)
Before writing any CSS or GSAP code:
1. **Verify Exact DOM IDs & Classes:** Inspect `index.html` first. This project uses `#s1` through `#s15` for scenes and `assets/style.css` for styles (never assume `#scene-1` or `styles.css`).
2. **Check Inline Style Overrides:** Search `index.html` for inline `style="..."` attributes (such as `z-index`, `opacity`, `transform`, or `color`) that would override external CSS rules.

## 2. HARD GEOMETRY & LAYOUT LAWS (1920×1080 SAFE FRAME)
Every active scene (`#s1`–`#s15`) must obey these mathematical bounds at its peak reading frame:
1. **Full-Bleed Scene Root:** Every `.scene` (`#s1`–`#s15`) must be `position: absolute; inset: 0; width: 1920px; height: 1080px; padding: 0; margin: 0; overflow: hidden;`.
2. **Safe-Title Bounding Box:** All visible text and UI cards must stay strictly inside the safe area:
   - `left >= 80px`, `right <= 1840px`
   - `top >= 80px` (or `>= 110px` when `#hud` is active), `bottom <= 980px` (above `#vo-caption-bar`).
3. **Zero Child Overflow Inside Cards:** For every `.ui-card-3d`, `.arch-flow-card`, `.sos-card`, and `.rag-main-card`:
   - `childRect.right <= cardRect.right - 12` and `childRect.left >= cardRect.left + 12`.
   - Never hide a flex/grid sibling with `opacity: 0` if it leaves an empty layout hole (e.g., `#sos-wrap` inside `#s6`). Either keep it visible (`opacity: 1`) or use CSS Grid with fixed track proportions.
4. **Card Content Density (No Huge White Gaps):**
   - Never apply arbitrary `min-height: 400px+` or `grid-template-rows: 1fr 1fr` that stretches cards taller than their children.
   - The vertical union of a card's visible children must fill at least **70% of the card's height**. If a card looks sparse, add authentic municipal telemetry footers (timestamps, GPS coordinates, sub-station distance, or status pills).
5. **Strict Z-Index Layering:**
   - Background grids, blurred networks (`#s14-bg-network`), and SVG connector lines (`#s4-flow-svg`, `#s14-flow-svg`) MUST sit at `z-index: 1`.
   - Solid UI cards (`.arch-flow-card`, `.ui-card-3d`) MUST sit at `z-index: 10` with opaque backgrounds (`#ffffff` or `#0f172a`) so connector lines only appear in the gaps *between* cards and never cross over text.
   - Specular `.light-sheen` overlays must default to `opacity: 0 !important` and return to `opacity: 0` immediately after sweeping so they never leave a gray diagonal streak over dark cards.

## 3. CONTRAST & TYPOGRAPHY LAWS
1. **Light Background Scenes (`#s1`–`#s4`, `#s6`–`#s8`, `#s11`–`#s14`):**
   - Primary headlines and body text MUST be Dark Slate (`#0f172a` or `#334155`) with `text-shadow: none`. White text (`#ffffff`) directly on a light background is a critical failure.
2. **Crimson / Dark Slate Scenes (`#s5` beats 2 & 3, `#s9` dark card, `#s10` right half, `#s15`):**
   - Text on crimson or dark slate backgrounds MUST be solid pure white (`#ffffff`) or high-contrast status accents (`#22c55e`, `#f59e0b`).

## 4. SMOOTH CINEMATOGRAPHY & VOICEOVER SYNC LAWS
1. **Smooth Easing Only:** Use `power3.out` or `expo.out` (`duration: 0.65s–0.85s`) with subtle vertical glides (`y: 24 -> 0`) and gentle 2D camera drift (`scale: 1.0 -> 1.03`). Never use extreme 3D `rotationX/Y` on multi-card grids, radar labels, or diagonal split-screens.
2. **Voiceover Non-Overlap Rule:** Every segment in `audio/vo-script.json` must satisfy:
   `segment.start + actualMp3DurationSeconds <= nextSegment.start - 0.25`.
   If an MP3 is longer than its scene window, shorten the script text and regenerate the MP3 via `node tools/generate-vo.mjs`.

## 5. MANDATORY POST-EDIT QA LOOP
After ANY edit to HTML, CSS, GSAP, or Audio, you MUST run:
`node tools/qa-audit.mjs`
Do NOT mark the task complete until `node tools/qa-audit.mjs` reports **0 layout, contrast, whitespace, or audio-overlap errors** across all 15 scenes.
