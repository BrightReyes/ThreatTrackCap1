// Projects the real Valenzuela boundary (from the mobile app) into assets/boundary.js.
import fs from "node:fs";
const src = fs.readFileSync("../../mobile/screens/HomeScreen.js", "utf8");
const start = src.indexOf("const VALENZUELA_BOUNDARY");
const block = src.slice(start, src.indexOf("];", start));
const pts = [...block.matchAll(/latitude:\s*([\d.]+),\s*longitude:\s*([\d.]+)/g)].map((m) => [+m[1], +m[2]]);
const box = {
  minLat: Math.min(...pts.map((p) => p[0])), maxLat: Math.max(...pts.map((p) => p[0])),
  minLng: Math.min(...pts.map((p) => p[1])), maxLng: Math.max(...pts.map((p) => p[1])),
};
fs.writeFileSync("assets/boundary.js", `window.VZ=${JSON.stringify({ pts, box })};\n`);
console.log(pts.length, box);
