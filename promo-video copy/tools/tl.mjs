// tools/tl.mjs — load timeline.js (source beats + generated warp) for Node tools.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const TIMELINE_PATH = path.join(ROOT, "timeline.js");
export const SCENES = Array.from({ length: 15 }, (_, i) => `s${i + 1}`);

export function loadTL(src = fs.readFileSync(TIMELINE_PATH, "utf8")) {
  // timeline.js is a browser script; evaluate it with no `window`, then read TL.
  const TL = new Function(`${src}\n;return TL;`)();
  if (typeof TL.warp !== "function") TL.warp = (t) => t;
  return TL;
}
