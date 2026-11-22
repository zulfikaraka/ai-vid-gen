import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { EPISODES_DIR, PROJECT_ROOT, safeId } from "@/lib/store";

const jobs = globalThis.__ttsJobs || (globalThis.__ttsJobs = new Map());

export async function GET(_request, { params }) {
  const { id } = await params;
  const job = jobs.get(safeId(id)) || { status: "idle", logs: [] };
  return NextResponse.json(job);
}

export async function POST(_request, { params }) {
  const { id } = await params;
  const cleanId = safeId(id);
  const epDir = path.join(EPISODES_DIR, cleanId);
  if (!fs.existsSync(path.join(epDir, "episode.json"))) {
    return NextResponse.json({ error: "episode.json tidak ditemukan" }, { status: 404 });
  }

  const existing = jobs.get(cleanId);
  if (existing?.status === "running") {
    return NextResponse.json(existing);
  }

  const state = { status: "running", logs: [`Starting TTS generation for ${cleanId}...`], startedAt: new Date().toISOString() };
  jobs.set(cleanId, state);

  const scriptPath = path.join(PROJECT_ROOT, "scripts", "tts_generate.py");
  const child = spawn("python", [scriptPath, `episodes/${cleanId}`], {
    cwd: PROJECT_ROOT,
    shell: true,
  });

  const pushLog = (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    state.logs.push(...lines);
    if (state.logs.length > 200) state.logs = state.logs.slice(-200);
  };

  child.stdout.on("data", pushLog);
  child.stderr.on("data", pushLog);
  child.on("close", (code) => {
    state.status = code === 0 ? "done" : "error";
    state.exitCode = code;
    state.finishedAt = new Date().toISOString();
    state.logs.push(code === 0 ? "✅ TTS generation finished." : `❌ TTS exited with code ${code}`);
  });

  return NextResponse.json(state);
}
