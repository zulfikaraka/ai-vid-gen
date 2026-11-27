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

export async function POST(request, { params }) {
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

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const tier = body.tier === "paid" ? "paid" : "free";
  const model = typeof body.model === "string" && body.model.trim() ? body.model.trim() : "";
  const voice = typeof body.voice === "string" && body.voice.trim() ? body.voice.trim() : "";
  const force = Boolean(body.force);

  const label = tier === "paid" ? `PAID (ElevenLabs${model ? ` / ${model}` : ""})` : "FREE (Gemini TTS)";
  const state = {
    status: "running",
    tier,
    logs: [`Starting TTS generation for ${cleanId} [${label}]...`],
    startedAt: new Date().toISOString(),
  };
  jobs.set(cleanId, state);

  const scriptPath = path.join(PROJECT_ROOT, "scripts", "tts_generate.py");
  const pyArgs = [scriptPath, `episodes/${cleanId}`, "--tier", tier];
  if (tier === "paid" && model) pyArgs.push("--model", model);
  if (voice) pyArgs.push("--voice", voice);
  if (force) pyArgs.push("--force");

  const pyBin = process.env.HERMES_PY || "python";
  const child = spawn(pyBin, pyArgs, {
    cwd: PROJECT_ROOT,
    windowsHide: true,
  });

  const pushLog = (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    state.logs.push(...lines);
    if (state.logs.length > 200) state.logs = state.logs.slice(-200);
  };

  child.stdout.on("data", pushLog);
  child.stderr.on("data", pushLog);
  child.on("error", (err) => {
    state.status = "error";
    state.finishedAt = new Date().toISOString();
    state.logs.push(`❌ Failed to start Python (${pyBin}): ${err.message}`);
  });
  child.on("close", (code) => {
    state.status = code === 0 ? "done" : "error";
    state.exitCode = code;
    state.finishedAt = new Date().toISOString();
    state.logs.push(code === 0 ? "✅ TTS generation finished." : `❌ TTS exited with code ${code}`);
  });

  return NextResponse.json(state);
}
