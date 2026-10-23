import { spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { createServer } from "node:net";

const projectRoot = process.cwd();
const artifactDir = resolve(projectRoot, "artifacts");
const sceneDir = join(artifactDir, "demo-scenes");
const audioPath = join(artifactDir, "neighborhood-hacks-2026-voiceover.wav");
const outputBase = "bebo-neighborhood-hacks-2026-demo.webm";
const appUrl = process.env.BEBO_DEMO_URL || "http://127.0.0.1:5173/";
const rendererUrl = process.env.BEBO_DEMO_RENDERER_URL || new URL("artifacts/demo-renderer.html", appUrl).href;
const edge = process.env.BEBO_EDGE_PATH || "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
async function getAvailablePort() {
  const server = createServer();
  await new Promise((resolveListening, rejectListening) => {
    server.once("error", rejectListening);
    server.listen(0, "127.0.0.1", resolveListening);
  });
  const address = server.address();
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
  return address.port;
}

const debugPort = Number(process.env.BEBO_DEMO_RENDER_CDP_PORT || await getAvailablePort());
const voicePath = resolve(audioPath);

if (!Number.isInteger(debugPort) || debugPort < 1024 || debugPort > 65535) {
  throw new Error("BEBO_DEMO_RENDER_CDP_PORT must be an available port from 1024 to 65535.");
}

const sceneImageNames = [
  "home",
  "provider-ollama",
  "settings-add-provider",
  "settings-provider",
  "community-plan",
  "community-tracker-prompt",
  "accessible-update",
  "settings-craft-apps",
];

const narrationMarkdown = await readFile(join(projectRoot, "docs", "neighborhood-hacks-2026-demo-script.md"), "utf8");
const marker = "**Narration:** ";
const narrationSegments = [];
let markerOffset = 0;
while ((markerOffset = narrationMarkdown.indexOf(marker, markerOffset)) >= 0) {
  let start = markerOffset + marker.length;
  if (narrationMarkdown.charCodeAt(start) === 0x201c) start += 1;
  const end = narrationMarkdown.indexOf("\u201d", start);
  if (end < 0) throw new Error("A narration paragraph is missing its closing quotation mark.");
  narrationSegments.push(narrationMarkdown.slice(start, end).trim());
  markerOffset = end + 1;
}
if (narrationSegments.length < 6) throw new Error("Could not find the narration paragraphs in the demo script.");

const wav = await readFile(audioPath);
if (wav.toString("ascii", 0, 4) !== "RIFF" || wav.toString("ascii", 8, 12) !== "WAVE") {
  throw new Error(`Voiceover is not a WAV file: ${audioPath}`);
}
const byteRate = wav.readUInt32LE(28);
let chunkOffset = 12;
let audioBytes = 0;
while (chunkOffset + 8 <= wav.length) {
  const id = wav.toString("ascii", chunkOffset, chunkOffset + 4);
  const size = wav.readUInt32LE(chunkOffset + 4);
  if (id === "data") { audioBytes = size; break; }
  chunkOffset += 8 + size + (size % 2);
}
if (byteRate <= 0 || audioBytes <= 0) throw new Error("Could not read the voiceover WAV duration.");
const durationSeconds = audioBytes / byteRate;

await mkdir(artifactDir, { recursive: true });
const existingFiles = new Set(await (await import("node:fs/promises")).readdir(artifactDir));
let outputName = outputBase;
if (existingFiles.has(outputName)) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  outputName = outputBase.replace(".webm", `-${stamp}.webm`);
}
const outputPath = join(artifactDir, outputName);

const imageData = {};
for (const name of sceneImageNames) {
  const imagePath = join(sceneDir, `${name}.png`);
  const image = await readFile(imagePath);
  imageData[name] = `data:image/png;base64,${image.toString("base64")}`;
}

const cues = [];
const screenshotsBySegment = [
  ["home"],
  ["provider-ollama", "settings-add-provider", "settings-provider"],
  ["community-plan"],
  ["community-tracker-prompt"],
  ["accessible-update"],
  ["settings-provider", "settings-add-provider"],
  ["settings-craft-apps"],
];

for (const [segmentIndex, segment] of narrationSegments.entries()) {
  const sentences = segment.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((sentence) => sentence.trim()).filter(Boolean) ?? [segment];
  const assignedImages = screenshotsBySegment[Math.min(segmentIndex, screenshotsBySegment.length - 1)];
  for (const [sentenceIndex, sentence] of sentences.entries()) {
    const imageIndex = assignedImages.length === 1
      ? 0
      : Math.min(assignedImages.length - 1, Math.floor((sentenceIndex / Math.max(1, sentences.length)) * assignedImages.length));
    const wordCount = sentence.split(/\s+/).filter(Boolean).length;
    cues.push({
      image: assignedImages[imageIndex],
      label: ["Access", "Providers", "Community plan", "Action tracker", "Accessible update", "Privacy", "Craft apps"][segmentIndex] || "Bebo",
      text: sentence,
      weight: wordCount + 1.5,
    });
  }
}

const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Bebo demo renderer</title>
<style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#10141a;color:#fff;font-family:Segoe UI,Arial,sans-serif}body{display:grid;place-items:center}canvas{width:1280px;height:720px;max-width:100vw;max-height:100vh;background:#151a20}#start{position:fixed;right:24px;top:24px;border:0;border-radius:8px;padding:12px 18px;background:#62d8ae;color:#10221c;font:700 15px Segoe UI,Arial,sans-serif;cursor:pointer}#start:disabled{opacity:.6;cursor:wait}#status{position:fixed;right:24px;top:70px;max-width:360px;color:#d7e4df;font-size:13px;text-align:right}</style></head>
<body><canvas id="frame" width="1280" height="720"></canvas><audio id="voice" preload="auto"></audio><button id="start" disabled>Preparing narrated demo…</button><div id="status">Loading screenshots and voiceover.</div><script>
const imageSources=${JSON.stringify(imageData)};
const cues=${JSON.stringify(cues)};
const audioData="data:audio/wav;base64,${wav.toString("base64")}";
const expectedDuration=${durationSeconds};
const canvas=document.getElementById("frame");
const ctx=canvas.getContext("2d");
const audio=document.getElementById("voice");
const startButton=document.getElementById("start");
const status=document.getElementById("status");
audio.src=audioData;
const images={};
window.__renderReady=false;
window.__renderDone=false;
window.__renderError="";
window.__renderStatus="Loading scene images and narration";
window.__renderDuration=expectedDuration;
function loadImage(name){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error("Unable to load scene "+name));img.src=imageSources[name];});}
Promise.all(Object.keys(imageSources).map(async name=>images[name]=await loadImage(name))).then(()=>{
  window.__renderImageCount=Object.keys(images).length;
  window.__renderStatus="Scene images loaded; waiting for narration metadata";
  audio.addEventListener("loadedmetadata",()=>{window.__renderReady=true;window.__renderStatus="Scene images and narration metadata loaded";startButton.disabled=false;startButton.textContent="Render narrated demo";status.textContent="Click once to record and download the narrated video.";},{once:true});
  audio.addEventListener("error",()=>window.__renderError="Narration audio error: "+(audio.error?.message||audio.error?.code||"unknown"),{once:true});
  audio.load();
  if(audio.readyState>=1){window.__renderReady=true;window.__renderStatus="Scene images and narration metadata loaded";startButton.disabled=false;startButton.textContent="Render narrated demo";status.textContent="Click once to record and download the narrated video.";}
  if(audio.readyState>=1)window.__renderReady=true;
}).catch(error=>{window.__renderError=String(error);window.__renderStatus="Failed to load a scene image";});
function wrapText(text,maxWidth){const words=text.split(/\\s+/);const lines=[];let line="";for(const word of words){const candidate=line?line+" "+word:word;if(ctx.measureText(candidate).width>maxWidth&&line){lines.push(line);line=word;}else line=candidate;}if(line)lines.push(line);return lines;}
function drawFrame(time){
  let elapsed=0;let cue=cues[cues.length-1];
  for(const candidate of cues){const duration=expectedDuration*candidate.weight/cues.reduce((sum,item)=>sum+item.weight,0);if(time<elapsed+duration){cue=candidate;break;}elapsed+=duration;}
  const image=images[cue.image];
  ctx.fillStyle="#11161d";ctx.fillRect(0,0,1280,720);
  ctx.drawImage(image,0,0,1280,720);
  const shade=ctx.createLinearGradient(0,510,0,720);shade.addColorStop(0,"rgba(7,10,14,0.12)");shade.addColorStop(0.22,"rgba(7,10,14,0.9)");shade.addColorStop(1,"rgba(7,10,14,0.96)");ctx.fillStyle=shade;ctx.fillRect(0,500,1280,220);
  ctx.fillStyle="#88e3bd";ctx.font="700 16px Segoe UI, Arial, sans-serif";ctx.fillText("BEBO  /  NEIGHBORHOOD HACKS 2026",52,545);
  ctx.fillStyle="#ffffff";ctx.font="700 27px Segoe UI, Arial, sans-serif";ctx.fillText(cue.label,52,584);
  ctx.fillStyle="#e4eaf0";ctx.font="22px Segoe UI, Arial, sans-serif";
  const lines=wrapText(cue.text,1160).slice(0,3);lines.forEach((line,index)=>ctx.fillText(line,52,624+index*31));
  ctx.fillStyle="rgba(255,255,255,.18)";ctx.fillRect(52,700,1176,3);ctx.fillStyle="#88e3bd";ctx.fillRect(52,700,1176*Math.min(1,time/expectedDuration),3);
}
window.startBeboRender=async()=>{
  try{
    if(!window.__renderReady)throw new Error("Renderer is still loading assets.");
    const audioContext=new AudioContext();
    await audioContext.resume();
    const source=audioContext.createMediaElementSource(audio);
    const audioDestination=audioContext.createMediaStreamDestination();
    source.connect(audioDestination);
    const stream=new MediaStream([...canvas.captureStream(30).getVideoTracks(),...audioDestination.stream.getAudioTracks()]);
    const mimeType=MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")?"video/webm;codecs=vp8,opus":"video/webm";
    const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:900000,audioBitsPerSecond:96000});
    const chunks=[];
    recorder.ondataavailable=event=>{if(event.data&&event.data.size)chunks.push(event.data);};
    recorder.onerror=event=>{window.__renderError=String(event.error||"MediaRecorder failed");};
    recorder.onstop=()=>{
      const blob=new Blob(chunks,{type:"video/webm"});
      const link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download=${JSON.stringify(outputName)};document.body.append(link);link.click();link.remove();
      status.textContent="Video ready. The download should appear in your browser.";
      startButton.textContent="Video ready";
      setTimeout(()=>{URL.revokeObjectURL(link.href);window.__renderDone=true;window.__renderBytes=blob.size;},1000);
    };
    const draw=()=>{drawFrame(audio.currentTime||0);if(!window.__renderDone)requestAnimationFrame(draw);};
    draw();
    recorder.start(1000);
    audio.onended=()=>setTimeout(()=>{if(recorder.state!=="inactive")recorder.stop();audioContext.close();},500);
    await audio.play();
    startButton.textContent="Recording narrated demo…";
    status.textContent="The recording takes about three minutes. Leave this tab open until the download starts.";
    window.__renderStarted=true;
    return true;
  }catch(error){window.__renderError=String(error);startButton.disabled=false;startButton.textContent="Retry render";status.textContent=String(error);return false;}
};
startButton.addEventListener("click",()=>window.startBeboRender());
</script></body></html>`;

const rendererPath = join(artifactDir, "demo-renderer.html");
await writeFile(rendererPath, html, "utf8");
if (process.env.BEBO_DEMO_HEADLESS !== "1") {
  console.log(`${rendererUrl}\nClick “Render narrated demo” to create ${outputName}.`);
  process.exit(0);
}
const profileDir = await mkdtemp(join(tmpdir(), "bebo-render-edge-"));
const browser = spawn(edge, [
  "--headless=new",
  "--disable-gpu",
  "--disable-background-mode",
  "--no-first-run",
  "--no-default-browser-check",
  "--autoplay-policy=no-user-gesture-required",
  `--user-data-dir=${profileDir}`,
  `--remote-debugging-port=${debugPort}`,
  "--remote-allow-origins=*",
  "--window-size=1280,720",
  rendererUrl,
], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
let browserDiagnostics = "";
browser.stderr.on("data", (chunk) => { browserDiagnostics += chunk.toString(); });

const sleep = (ms) => new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
let socket;
let requestId = 0;
const pending = new Map();
let rendered = false;

try {
  let target;
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (browser.exitCode !== null) throw new Error(`Edge exited with code ${browser.exitCode}. ${browserDiagnostics}`);
    try {
      const response = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (response.ok) {
        const targets = await response.json();
        target = targets.find((item) => item.type === "page" && item.url === rendererUrl && item.webSocketDebuggerUrl);
        if (target) break;
      }
    } catch {}
    await sleep(250);
  }
  if (!target) throw new Error("Timed out waiting for Edge's local DevTools endpoint.");

  socket = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolveOpen, rejectOpen) => {
    socket.addEventListener("open", resolveOpen, { once: true });
    socket.addEventListener("error", rejectOpen, { once: true });
  });
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (message.id === undefined) return;
    const handler = pending.get(message.id);
    if (!handler) return;
    pending.delete(message.id);
    clearTimeout(handler.timeout);
    if (message.error) handler.reject(new Error(message.error.message));
    else handler.resolve(message.result);
  });

  function send(method, params = {}, timeoutMs = 15_000) {
    const id = ++requestId;
    return new Promise((resolveRequest, rejectRequest) => {
      const timeout = setTimeout(() => {
        pending.delete(id);
        rejectRequest(new Error(`DevTools request timed out: ${method}`));
      }, timeoutMs);
      pending.set(id, {
        timeout,
        resolve(value) { resolveRequest(value); },
        reject(error) { rejectRequest(error); },
      });
      socket.send(JSON.stringify({ id, method, params }));
    });
  }

  async function evaluate(expression) {
    const response = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });
    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text);
    }
    return response.result?.value;
  }

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
  await send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: artifactDir });

  for (let attempt = 0; attempt < 90; attempt += 1) {
    const ready = await evaluate("Boolean(window.__renderReady)");
    const loadError = await evaluate("window.__renderError || ''");
    if (loadError) throw new Error(`Renderer failed to load assets: ${loadError}`);
    if (ready) break;
    await sleep(250);
  }
  const ready = await evaluate("Boolean(window.__renderReady)");
  if (!ready) {
    const details = await evaluate(`({url:location.href,title:document.title,status:window.__renderStatus,error:window.__renderError,audioReadyState:document.querySelector('#voice')?.readyState,audioNetworkState:document.querySelector('#voice')?.networkState,audioError:document.querySelector('#voice')?.error?.code,loadedScenes:window.__renderImageCount||0,scriptCount:document.scripts.length})`);
    throw new Error(`Timed out waiting for the video renderer and voiceover to load. ${JSON.stringify(details)}`);
  }

  await evaluate("window.startBeboRender()");
  const startedAt = Date.now();
  const maxWaitMs = Math.ceil(durationSeconds * 1000) + 45_000;
  while (Date.now() - startedAt < maxWaitMs) {
    const state = await evaluate("({done:window.__renderDone,error:window.__renderError,started:window.__renderStarted,bytes:window.__renderBytes})");
    if (state?.error) throw new Error(`Video render failed: ${state.error}`);
    if (state?.done) {
      for (let settle = 0; settle < 30; settle += 1) {
        try {
          const info = await stat(outputPath);
          if (info.size > 100_000) { rendered = true; break; }
        } catch {}
        await sleep(500);
      }
      if (rendered) break;
    }
    await sleep(1000);
  }
  if (!rendered) throw new Error("The video recorder did not finish saving the WebM file before timeout.");
  const outputInfo = await stat(outputPath);
  console.log(`${outputPath}\nDuration: ${durationSeconds.toFixed(1)} seconds\nSize: ${outputInfo.size} bytes`);
} finally {
  if (socket?.readyState === WebSocket.OPEN) {
    try { await send("Browser.close", {}, 3000); } catch {}
  }
  try { socket?.close(); } catch {}
  await new Promise((resolveClose) => {
    if (browser.exitCode !== null) return resolveClose();
    browser.once("exit", resolveClose);
    setTimeout(resolveClose, 5000);
  });
  if (browser.exitCode === null) {
    browser.kill();
    await new Promise((resolveClose) => {
      if (browser.exitCode !== null) return resolveClose();
      browser.once("exit", resolveClose);
      setTimeout(resolveClose, 3000);
    });
  }
  const tempRoot = resolve(tmpdir()).toLowerCase();
  const profilePath = resolve(profileDir).toLowerCase();
  if (!profilePath.startsWith(tempRoot + sep.toLowerCase())) {
    throw new Error("Refusing to remove an Edge profile outside the system temporary directory.");
  }
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await rm(profileDir, { recursive: true, force: true });
      break;
    } catch (error) {
      if (attempt === 7) console.warn(`Could not remove temporary Edge profile ${profileDir}: ${error.message}`);
      else await sleep(500);
    }
  }
}
