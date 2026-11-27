#!/usr/bin/env node
/**
 * Auto-generate episode visual assets (GATE 2A Stills & GATE 2B Veo Clips)
 * via local flow-mcp Chrome CDP automation.
 *
 * Usage:
 *   node scripts/flow_generate_episode.mjs --mode status
 *   node scripts/flow_generate_episode.mjs episodes/<id> --mode stills [--file <name>] [--force]
 *   node scripts/flow_generate_episode.mjs episodes/<id> --mode clips [--file <name>] [--max-credits 25] [--model "Veo 3.1 - Fast"] [--force]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AI_VID_GEN_ROOT = path.resolve(__dirname, "..");
const WORKSPACE_ROOT = path.resolve(AI_VID_GEN_ROOT, "..");
const FLOW_MCP_DIST = path.join(WORKSPACE_ROOT, "flow-mcp", "dist");
const DEFAULT_PROJECT_ID = process.env.FLOW_PROJECT_ID || "75f37628-085c-4e79-845f-94b6597b771a";

const args = process.argv.slice(2);
const opt = (name, def = "") => {
  const i = args.indexOf(`--${name}`);
  return i > -1 && args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : def;
};
const hasFlag = (name) => args.includes(`--${name}`);

const mode = opt("mode", "stills"); // "status" | "stills" | "clips"
const episodeArg = args.find((a) => !a.startsWith("--") && a !== mode && a !== opt("file") && a !== opt("max-credits") && a !== opt("model") && a !== opt("project"));
const targetFile = opt("file", "");
const force = hasFlag("force");
const maxCredits = Math.max(0, Number.parseInt(opt("max-credits", mode === "stills" ? "0" : "25"), 10) || 0);
const model = opt("model", "");
const projectId = opt("project", DEFAULT_PROJECT_ID);

if (!["status", "stills", "clips"].includes(mode)) {
  console.error(`Invalid --mode "${mode}". Use status | stills | clips.`);
  process.exit(1);
}

if (!fs.existsSync(path.join(FLOW_MCP_DIST, "flow.js"))) {
  console.error(`flow-mcp dist not found at ${FLOW_MCP_DIST}. Run "npm run build" inside flow-mcp/.`);
  process.exit(1);
}

const chromeMod = await import(pathToFileURL(path.join(FLOW_MCP_DIST, "chrome.js")).href);
const flowMod = await import(pathToFileURL(path.join(FLOW_MCP_DIST, "flow.js")).href);
const { getFlowPage, inEnglish } = chromeMod;
const { getFlowState, listAssets, downloadAsset, runGeneration } = flowMod;

async function ensureInProject() {
  let state = await getFlowState(false);
  if (!state.signedIn) {
    return state;
  }
  if (!state.inProject && projectId) {
    console.log(`[Flow] Membuka project Flow (${projectId})...`);
    const page = await getFlowPage();
    await page.goto(inEnglish(`https://flow.google.com/project/${projectId}`), {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(3500);
    state = await getFlowState(true);
  } else {
    state = await getFlowState(true);
  }
  return state;
}

function collectAssets(episode, epDir, kind) {
  const allBeats = [
    ...(episode.intro?.beats || []),
    ...(episode.modules || []).flatMap((m) => m.beats || []),
    ...(episode.outro?.beats || []),
  ];
  const seen = new Set();
  const list = [];
  for (const b of allBeats) {
    const v = b.visual;
    if (!v || v.kind !== kind || !v.src || seen.has(v.src)) continue;
    seen.add(v.src);
    list.push({
      src: v.src,
      fileName: path.basename(v.src),
      destPath: path.join(epDir, v.src),
      prompt: (v.prompt || "").trim(),
      exists: fs.existsSync(path.join(epDir, v.src)),
    });
  }
  return list;
}

function saveDownloadedAsset(downloadedPath, destPath, isVideo) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const srcExt = path.extname(downloadedPath).toLowerCase();
  const dstExt = path.extname(destPath).toLowerCase();

  if (srcExt === dstExt) {
    fs.copyFileSync(downloadedPath, destPath);
    return;
  }

  if (!isVideo) {
    // Convert image format cleanly (e.g. .jpeg/.webp -> .png) so episode.json path stays exact
    const r = spawnSync("ffmpeg", ["-y", "-loglevel", "error", "-i", downloadedPath, destPath], {
      encoding: "utf8",
      windowsHide: true,
    });
    if (r.status === 0 && fs.existsSync(destPath)) return;
  }

  // Fallback: direct copy
  fs.copyFileSync(downloadedPath, destPath);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Mode: status ─────────────────────────────────────────────────────────────
if (mode === "status") {
  try {
    const state = await ensureInProject();
    console.log("FLOW_STATUS_JSON:" + JSON.stringify(state));
    process.exit(0);
  } catch (err) {
    console.log(
      "FLOW_STATUS_JSON:" +
        JSON.stringify({
          signedIn: false,
          inProject: false,
          error: err.message,
          hint: "Pastikan Chrome untuk flow-mcp sudah terpasang & login Google Flow.",
        })
    );
    process.exit(0);
  }
}

// ─── Mode: stills / clips ─────────────────────────────────────────────────────
if (!episodeArg) {
  console.error("Episode directory is required (e.g. episodes/ep01_mitos_pesawat_terbang).");
  process.exit(1);
}

const epDir = path.isAbsolute(episodeArg) ? episodeArg : path.resolve(AI_VID_GEN_ROOT, episodeArg);
const epJsonPath = path.join(epDir, "episode.json");
if (!fs.existsSync(epJsonPath)) {
  console.error(`episode.json tidak ditemukan di ${epDir}`);
  process.exit(1);
}

const episode = JSON.parse(fs.readFileSync(epJsonPath, "utf8"));
const isVideo = mode === "clips";
const targetKind = isVideo ? "veo_video" : "still_3d";
const allItems = collectAssets(episode, epDir, targetKind);

let queue = allItems;
if (targetFile) {
  queue = allItems.filter((item) => item.fileName === targetFile);
  if (queue.length === 0) {
    console.error(`Slot "${targetFile}" tidak ditemukan di episode.json (kind=${targetKind}).`);
    process.exit(1);
  }
} else if (!force) {
  queue = allItems.filter((item) => !item.exists);
}

if (queue.length === 0) {
  console.log(`✅ Semua ${isVideo ? "Veo clips" : "3D stills"} sudah tersedia. Tidak ada yang perlu di-generate.`);
  process.exit(0);
}

console.log(`[Flow] Memeriksa sesi browser Google Flow...`);
const state = await ensureInProject();
if (!state.signedIn) {
  console.error(`❌ Belum login ke Google Flow. ${state.hint || "Silakan login dulu di jendela Chrome Flow."}`);
  process.exit(1);
}
if (!state.inProject) {
  console.error(`❌ Browser Flow belum masuk ke halaman project. ${state.hint || ""}`);
  process.exit(1);
}

console.log(
  `[Flow] Terhubung! Plan: ${state.plan || "unknown"} | Sisa kredit: ${state.credits ?? "?"} | Queue: ${queue.length} ${isVideo ? "clip(s)" : "still(s)"}`
);

// Keep Flow's download staging dir on the same drive as ~/.flow-mcp/downloads (avoid Windows EXDEV on renameSync)
const tempOutDir = path.join(os.homedir(), "flow-mcp-out", "_dashboard_tmp", episode.id);
fs.mkdirSync(tempOutDir, { recursive: true });

// Check existing assets in Flow project so we can free re-download instead of regenerating (0 credits)
let existingFlowAssets = [];
if (!force) {
  try {
    console.log(`[Flow] Memindai library project Flow untuk aset yang sudah ada (re-download gratis)...`);
    existingFlowAssets = await listAssets();
    console.log(`[Flow] Ditemukan ${existingFlowAssets.length} aset di library Flow.`);
  } catch (err) {
    console.log(`[Flow] Lewati scan library (${err.message})`);
  }
}

function findExistingFlowAsset(stem, isVideo) {
  const wantKind = isVideo ? "video" : "image";
  const candidates = [
    `${episode.id}-${stem}`.toLowerCase(),
    `_flow_tmp-${stem}`.toLowerCase(),
    stem.toLowerCase(),
  ];
  return existingFlowAssets.find(
    (a) => a.kind === wantKind && candidates.some((c) => a.name.toLowerCase().startsWith(c))
  );
}

let okCount = 0;
let failCount = 0;
let totalCredits = 0;
const pauseMs = Number(process.env.FLOW_MCP_PAUSE_S || (isVideo ? 12 : 6)) * 1000;

for (let i = 0; i < queue.length; i++) {
  const item = queue[i];
  const stem = path.basename(item.fileName, path.extname(item.fileName));
  console.log(`\n[${i + 1}/${queue.length}] ${isVideo ? "Veo clip" : "3D still"}: ${item.fileName}`);

  // 1) Free re-download if already generated in Flow project (saves credits & time!)
  const existing = !force ? findExistingFlowAsset(stem, isVideo) : null;
  if (existing) {
    try {
      console.log(`  ♻️ Ditemukan di Flow ("${existing.name}") — re-download gratis (0 credits)...`);
      const files = await downloadAsset(existing.name, path.join(tempOutDir, stem), "original");
      if (!files.length || !fs.existsSync(files[0])) {
        throw new Error("Re-download tidak mengembalikan file.");
      }
      saveDownloadedAsset(files[0], item.destPath, isVideo);
      try {
        fs.unlinkSync(files[0]);
      } catch {
        // ignore temp cleanup failure
      }
      okCount++;
      console.log(`  ✅ Tersimpan (re-download gratis) -> ${item.src} (0 credits)`);
      continue;
    } catch (err) {
      console.log(`  ⚠️ Re-download gagal (${err.message}), lanjut generate baru...`);
    }
  }

  if (!item.prompt) {
    console.error(`  ⚠️ Skip ${item.fileName}: prompt kosong di episode.json`);
    failCount++;
    continue;
  }

  const job = {
    id: `${episode.id}-${stem}`,
    status: "running",
    params: {
      prompt: item.prompt,
      type: isVideo ? "video" : "image",
      aspect_ratio: "16:9",
      max_credits: isVideo ? maxCredits : 0,
      ...(model ? { model } : {}),
      variants: 1,
      retries: 1,
      download_quality: "original",
      output_dir: tempOutDir,
      file_stem: stem,
    },
    files: [],
    attempts: 1,
    createdAt: new Date().toISOString(),
  };

  try {
    const files = await runGeneration(job);
    if (!files.length || !fs.existsSync(files[0])) {
      throw new Error("Flow selesai tetapi tidak mengembalikan file hasil download.");
    }
    saveDownloadedAsset(files[0], item.destPath, isVideo);
    try {
      fs.unlinkSync(files[0]);
    } catch {
      // ignore temp cleanup failure
    }
    const spent = Number(job.credits || 0);
    totalCredits += spent;
    okCount++;
    console.log(`  ✅ Tersimpan -> ${item.src} (${spent} credits)${job.note ? ` | ${job.note}` : ""}`);
  } catch (err) {
    failCount++;
    console.error(`  ❌ Gagal ${item.fileName}: ${err.message}`);
  }

  if (i < queue.length - 1) {
    console.log(`  ⏳ Jeda ${Math.round(pauseMs / 1000)} detik sebelum item berikutnya...`);
    await sleep(pauseMs);
  }
}

console.log(
  `\n[Flow] Selesai: ${okCount} berhasil, ${failCount} gagal | Total kredit terpakai: ${totalCredits}`
);
process.exit(failCount > 0 && okCount === 0 ? 1 : 0);
