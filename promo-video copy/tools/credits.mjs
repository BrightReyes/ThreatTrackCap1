import { readFileSync, writeFileSync } from "node:fs";
const cues = JSON.parse(readFileSync("audio/cues.json", "utf8")).cues;
const kit = readFileSync("audio/kit/CREDITS.md", "utf8").split("\n");
const ids = new Set();
for (const c of cues) for (const s of c.sound.split("+")) ids.add(s);
const lines = [];
for (const id of [...ids].sort()) {
  const hit = kit.find((l) => l.startsWith(`- ${id}:`));
  lines.push(hit || `- ${id}: Kenney (kenney.nl), CC0 — see audio/kit/CREDITS.md pack list`);
}
const out = `# ThreatTrack promo — audio credits

## Music
- "Called to Win" — CC0 (public domain), from the Internet Archive item
  "Public Domain Background Tracks": https://archive.org/details/public-domain-background-tracks
  (file: called-to-win.mp3). Trimmed to the film with a 1.4 s fade.

## Sound effects (${ids.size} recordings used, all CC0)
Built with opus-sound-layer (https://github.com/Bodila51/opus-sound-layer). Full kit list: audio/kit/CREDITS.md.

${lines.join("\n")}
`;
writeFileSync("audio/CREDITS.md", out);
console.log(ids.size, "sounds credited");
