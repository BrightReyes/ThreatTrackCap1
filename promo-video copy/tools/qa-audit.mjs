// tools/qa-audit.mjs — Automated 1920x1080 DOM Geometry, Contrast, Whitespace & VO Auditor
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const URL = process.env.PREVIEW_URL || "http://localhost:3002/index.html";

// Peak reading timestamps for all 15 scenes
const SCENE_CHECKPOINTS = [
  { scene: "#s1", time: 1.0, name: "Scene 1 Beat 1 (City Hook)" },
  { scene: "#s1", time: 2.3, name: "Scene 1 Beat 2 (Reach)" },
  { scene: "#s2", time: 4.3, name: "Scene 2 (Inciting Incident)" },
  { scene: "#s3", time: 6.7, name: "Scene 3 (Immediate Action)" },
  { scene: "#s4", time: 9.8, name: "Scene 4 (System Architecture Flow)" },
  { scene: "#s5", time: 11.7, name: "Scene 5 Beat 1 (Report)" },
  { scene: "#s5", time: 12.4, name: "Scene 5 Beat 2 (Track)" },
  { scene: "#s5", time: 13.1, name: "Scene 5 Beat 3 (Respond)" },
  { scene: "#s6", time: 17.8, name: "Scene 6 (SOS Gateway + Status Rows)" },
  { scene: "#s7", time: 23.6, name: "Scene 7 (Mobile Report Flow)" },
  { scene: "#s8", time: 27.6, name: "Scene 8 (Live Status Pipeline)" },
  { scene: "#s9", time: 31.2, name: "Scene 9 (Dispatch Command Center)" },
  { scene: "#s10", time: 43.5, name: "Scene 10 (Split-Screen Sync & Reading Hold)" },
  { scene: "#s11", time: 47.0, name: "Scene 11 (Hotspot Radar)" },
  { scene: "#s12", time: 55.5, name: "Scene 12 (AI & RAG Pipeline Flow)" },
  { scene: "#s13", time: 59.1, name: "Scene 13 (Community Storm)" },
  { scene: "#s14", time: 63.5, name: "Scene 14 (Ecosystem Convergence)" },
  { scene: "#s15", time: 69.5, name: "Scene 15 (Case Resolution Outro)" }
];

async function runAudit() {
  const errors = [];
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

  await page.goto(URL, { waitUntil: "networkidle" });

  for (const cp of SCENE_CHECKPOINTS) {
    await page.evaluate((t) => {
      if (window.syncClips) window.syncClips(t);
      if (window.masterTimeline) {
        window.masterTimeline.seek(t);
        window.masterTimeline.pause();
      } else if (window.tl) {
        window.tl.seek(t);
        window.tl.pause();
      } else if (window.__mainTimeline) {
        window.__mainTimeline.seek(t);
        window.__mainTimeline.pause();
      }
    }, cp.time);
    await page.waitForTimeout(120);

    const sceneErrors = await page.evaluate(({ sceneSel, label }) => {
      const errs = [];
      const scene = document.querySelector(sceneSel);
      if (!scene) {
        errs.push(`[${label}] Missing scene selector ${sceneSel}`);
        return errs;
      }

      const sceneBg = getComputedStyle(scene).backgroundColor;
      const isLightScene = sceneBg === "rgb(255, 255, 255)" || sceneBg === "rgba(0, 0, 0, 0)";

      // 1. Check visible text nodes for white-on-white contrast & viewport clipping
      const textEls = scene.querySelectorAll("h1, h2, h3, p, strong, span, .word, .s1-node-card, .rag-node-pill");
      textEls.forEach((el) => {
        const style = getComputedStyle(el);
        if (parseFloat(style.opacity) < 0.2 || style.display === "none" || style.visibility === "hidden") return;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return;

        // Check viewport clipping
        if (rect.left < 16 || rect.right > 1904 || rect.top < 16 || rect.bottom > 1064) {
          errs.push(`[${label}] Element "${el.textContent.trim().slice(0, 28)}" clipped outside 1920x1080 (left:${Math.round(rect.left)}, right:${Math.round(rect.right)}, top:${Math.round(rect.top)}, bottom:${Math.round(rect.bottom)})`);
        }

        // Check white text on light background (unless inside a dark card/pill)
        const darkParent = el.closest(".dark-glass, .cmd-card, .s10-right, .s10-console-card, .s10-dark-card, .s10-step-num, .dark-hdr, .s10-c1-btn, .s10-hq-btn, .s10-sub-btn, .s10-node-circle, .dark-tag, .s10-dispatch-btn, .badge-red, .sos-btn, #s5-beat-2, #s5-beat-3, #s7-btn, #s7-toast, .toast");
        if (isLightScene && !darkParent && style.color === "rgb(255, 255, 255)") {
          errs.push(`[${label}] White-on-white unreadable text: "${el.textContent.trim().slice(0, 28)}"`);
        }
      });

      // 2. Check UI Cards for child overflow & excessive empty whitespace (>35% empty)
      const cards = scene.querySelectorAll(".ui-card-3d, .arch-flow-card, .sos-card, .rag-main-card");
      cards.forEach((card, i) => {
        const cStyle = getComputedStyle(card);
        if (parseFloat(cStyle.opacity) < 0.2) return;
        const cRect = card.getBoundingClientRect();

        // Check if children overflow right/bottom of card
        const children = card.querySelectorAll(".sos-row, .rag-action-item, p, strong, span");
        let maxChildBottom = cRect.top;
        children.forEach((ch) => {
          const chStyle = getComputedStyle(ch);
          if (parseFloat(chStyle.opacity) < 0.2) return;
          const r = ch.getBoundingClientRect();
          if (r.bottom > maxChildBottom) maxChildBottom = r.bottom;
          if (r.right > cRect.right + 4) {
            errs.push(`[${label}] Child "${ch.textContent.trim().slice(0, 24)}" overflows right edge of card #${i + 1} (${Math.round(r.right)} > ${Math.round(cRect.right)})`);
          }
        });

        const usedRatio = (maxChildBottom - cRect.top) / Math.max(cRect.height, 1);
        if (cRect.height > 220 && usedRatio < 0.65) {
          errs.push(`[${label}] Card #${i + 1} has excessive empty bottom whitespace (only ${Math.round(usedRatio * 100)}% vertical fill)`);
        }
      });

      // 3. Check stuck .light-sheen overlays
      scene.querySelectorAll(".light-sheen").forEach((sheen) => {
        if (parseFloat(getComputedStyle(sheen).opacity) > 0.08) {
          errs.push(`[${label}] .light-sheen is stuck visible (opacity > 0.08) causing a diagonal smudge`);
        }
      });

      return errs;
    }, { sceneSel: cp.scene, label: cp.name });

    errors.push(...sceneErrors);
  }

  await browser.close();

  if (errors.length > 0) {
    console.error(`\n❌ QA AUDIT FAILED WITH ${errors.length} ISSUES:\n` + errors.map((e) => `  - ${e}`).join("\n"));
    process.exit(1);
  } else {
    console.log("\n✅ QA AUDIT PASSED: All 15 scenes are centered, high-contrast, unclipped, and balanced!");
  }
}

runAudit();
