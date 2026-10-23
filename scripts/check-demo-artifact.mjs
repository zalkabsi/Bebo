import { readFile, stat } from "node:fs/promises";
import { resolve, relative } from "node:path";

const videoPath = resolve(process.argv[2] || "artifacts/bebo-neighborhood-hacks-2026-demo.webm");
const narrationPath = resolve("docs/neighborhood-hacks-2026-demo-script.md");

let video;
try {
  video = await readFile(videoPath);
} catch {
  throw new Error(`Demo video not found at ${videoPath}. Render it from the local demo renderer first.`);
}

const videoInfo = await stat(videoPath);
if (videoInfo.size < 100_000 || !video.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
  throw new Error("The demo output is not a valid WebM recording.");
}
if (!video.includes(Buffer.from("V_VP8")) || !video.includes(Buffer.from("A_OPUS"))) {
  throw new Error("The WebM must include both VP8 video and Opus narration tracks.");
}

const markdown = await readFile(narrationPath, "utf8");
const spokenLines = [...markdown.matchAll(/\*\*Narration:\*\* [“"]([^”"]+)[”"]/g)].map((match) => match[1]);
if (spokenLines.length < 6) throw new Error("The demo script is missing narration sections.");
if (/\b(?:Microsoft|Excel)\b/i.test(spokenLines.join(" "))) {
  throw new Error("The spoken narration still contains a product name that should be omitted from the video.");
}

console.log(`${relative(process.cwd(), videoPath)} is a ${videoInfo.size.toLocaleString()} byte WebM with VP8 video, Opus audio, and brand-neutral narration.`);
