import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { EPISODES_DIR, PROJECT_ROOT, safeId } from "@/lib/store";

const jobs = globalThis.__visualJobs || (globalThis.__visualJobs = new Map());

function findRunningJob() {
  for (const [epId, job] of jobs.entries()) {
    if (job?.status === "running") return { epId, job };
  }
  return null;
}

export async function GET(request, { params }) {
  const { id } = await params;
  const cleanId = safeId(id);
  const url = new URL(request.url);

  if (url.searchParams.get("checkFlow") === "1") {
    const running = findRunningJob();
    if (running) {
      return NextResponse.json({
        signedIn: true,
        inProject: true,
        busy: true,
        hint: `Flow sedang sibuk menjalankan job untuk ${running.epId}.`,
      });
    }
    const scriptPath = path.join(PROJECT_ROOT, "scripts", "flow_generate_episode.mjs");
    const r = spawnSync("node", [scriptPath, "--mode", "status"], {
      cwd: PROJECT_ROOT,
      encoding: "utf8",
      timeout: 35000,
      windowsHide: true,
    });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const line = out
      .split(/\r?\n/)
      .find((l) => l.startsWith("FLOW_STATUS_JSON:"));
    if (line) {
      try {
        const parsed = JSON.parse(line.replace("FLOW_STATUS_JSON:", ""));
        globalThis.__flowCreditsCache = {
          synced: true,
          signedIn: Boolean(parsed.signedIn),
          inProject: Boolean(parsed.inProject),
          plan: parsed.plan || null,
          credits: parsed.credits ?? null,
          hint: parsed.hint || parsed.error || null,
          updatedAt: new Date().toISOString(),
        };
        return NextResponse.json(parsed);
      } catch {
        // fall through
      }
    }
    return NextResponse.json({
      signedIn: false,
      inProject: false,
      error: (r.stderr || r.stdout || "Gagal mengecek status Flow").slice(-400),
    });
  }

  const job = jobs.get(cleanId) || { status: "idle", logs: [] };
  return NextResponse.json(job);
}

export async function POST(request, { params }) {
  const { id } = await params;
  const cleanId = safeId(id);
  const epDir = path.join(EPISODES_DIR, cleanId);
  if (!fs.existsSync(path.join(epDir, "episode.json"))) {
    return NextResponse.json({ error: "episode.json tidak ditemukan" }, { status: 404 });
  }

  const running = findRunningJob();
  if (running) {
    if (running.epId === cleanId) {
      return NextResponse.json(running.job);
    }
    return NextResponse.json(
      { error: `Chrome Flow sedang digunakan oleh episode "${running.epId}". Tunggu hingga selesai.` },
      { status: 409 }
    );
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode === "clips" ? "clips" : "stills";
  const fileName = typeof body.fileName === "string" && body.fileName.trim() ? path.basename(body.fileName.trim()) : "";
  const force = Boolean(body.force);
  const maxCredits = mode === "clips" ? Math.max(0, Math.min(100, Number(body.maxCredits ?? 25) || 25)) : 0;
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "";

  const label = fileName
    ? `${mode === "clips" ? "Veo Clip" : "3D Still"} (${fileName})`
    : mode === "clips"
    ? `Missing Veo Clips (max ${maxCredits} cr/clip)`
    : "Missing 3D Stills (0 credits)";

  const state = {
    status: "running",
    mode,
    fileName: fileName || null,
    logs: [`🚀 Starting Google Flow auto-generation: ${label}...`],
    startedAt: new Date().toISOString(),
  };
  jobs.set(cleanId, state);

  const scriptPath = path.join(PROJECT_ROOT, "scripts", "flow_generate_episode.mjs");
  const nodeArgs = [scriptPath, `episodes/${cleanId}`, "--mode", mode];
  if (fileName) nodeArgs.push("--file", fileName);
  if (force) nodeArgs.push("--force");
  if (mode === "clips") {
    nodeArgs.push("--max-credits", String(maxCredits));
    if (model) nodeArgs.push("--model", model);
  }

  const child = spawn("node", nodeArgs, {
    cwd: PROJECT_ROOT,
    windowsHide: true,
  });

  const pushLog = (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    state.logs.push(...lines);
    if (state.logs.length > 300) state.logs = state.logs.slice(-300);
  };

  child.stdout.on("data", pushLog);
  child.stderr.on("data", pushLog);
  child.on("error", (err) => {
    state.status = "error";
    state.finishedAt = new Date().toISOString();
    state.logs.push(`❌ Failed to start Flow script: ${err.message}`);
  });
  child.on("close", (code) => {
    state.status = code === 0 ? "done" : "error";
    state.exitCode = code;
    state.finishedAt = new Date().toISOString();
    state.logs.push(code === 0 ? "✅ Flow visual generation finished." : `❌ Flow visual generation exited with code ${code}`);
  });

  return NextResponse.json(state);
}
