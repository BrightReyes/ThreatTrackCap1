// tools/cues.mjs — Builds audio/cues.json for ThreatTrack promo v2.0
import { writeFileSync, readFileSync } from "node:fs";

const cuesPath = new URL("../audio/cues.json", import.meta.url);
const currentCues = JSON.parse(readFileSync(cuesPath, "utf8"));

console.log(`Loaded ${currentCues.cues?.length || 0} acoustic cues for ThreatTrack promo v2.0`);
