import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { EPISODES_DIR, getEpisode, PROJECT_ROOT, safeId } from "@/lib/store";

const jobs = globalThis.__renderJobs || (globalThis.__renderJobs = new Map());

export async function GET(_request, { params }) {
  const { id } = await params;
  const job = jobs.get(safeId(id)) || { status: "idle", logs: [] };
  return NextResponse.json(job);
}

function runCommandStep(cmd, args, cwd, onLog) {
  return new Promise((resolve, reject) => {
    onLog(`$ ${cmd} ${args.join(" ")}`);
    const child = spawn(cmd, args, { cwd, shell: true });
    child.stdout.on("data", (d) => onLog(String(d)));
    child.stderr.on("data", (d) => onLog(String(d)));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`Command failed (${code}): ${cmd} ${args.join(" ")}`));
    });
  });
}

export async function POST(request, { params }) {
  const { id } = await params;
  const cleanId = safeId(id);
  const body = await request.json().catch(() => ({}));
  const mode = body.mode || "all"; // "compile" | "all" | "long" | "shorts"

  const ep = getEpisode(cleanId);
  if (!ep) return NextResponse.json({ error: "Episode tidak ditemukan" }, { status: 404 });

  const existing = jobs.get(cleanId);
  if (existing?.status === "running") {
    return NextResponse.json(existing);
  }

  const state = {
    status: "running",
    mode,
    logs: [`Starting ${mode} pipeline for ${cleanId}...`],
    startedAt: new Date().toISOString(),
  };
  jobs.set(cleanId, state);

  const pushLog = (chunk) => {
    const lines = String(chunk).split(/\r?\n/).filter(Boolean);
    state.logs.push(...lines);
    if (state.logs.length > 300) state.logs = state.logs.slice(-300);
  };

  (async () => {
    try {
      // Refresh build/assets so newly uploaded clips/stills are always included
      const buildAssets = path.join(EPISODES_DIR, cleanId, "build", "assets");
      if (fs.existsSync(buildAssets)) {
        fs.rmSync(buildAssets, { recursive: true, force: true });
      }

      await runCommandStep("node", ["engine/compiler/build_episode.mjs", `episodes/${cleanId}`], PROJECT_ROOT, pushLog);

      if (mode !== "compile") {
        const prefix = cleanId.split("_")[0] || cleanId;
        if (mode === "all" || mode === "long") {
          await runCommandStep(
            "npx",
            [
              "hyperframes",
              "render",
              "--composition",
              `episodes/${cleanId}/build/long_16x9.html`,
              "--output",
              `episodes/${cleanId}/output/${prefix}_long_16x9.mp4`,
            ],
            PROJECT_ROOT,
            pushLog
          );
        }
        if (mode === "all" || mode === "shorts") {
          for (const mod of ep.episode.modules || []) {
            await runCommandStep(
              "npx",
              [
                "hyperframes",
                "render",
                "--composition",
                `episodes/${cleanId}/build/short_${mod.id}_9x16.html`,
                "--output",
                `episodes/${cleanId}/output/${prefix}_short_${mod.id}_9x16.mp4`,
              ],
              PROJECT_ROOT,
              pushLog
            );
          }
        }
      }

      state.status = "done";
      state.finishedAt = new Date().toISOString();
      pushLog("✅ Compile & render completed!");
    } catch (err) {
      state.status = "error";
      state.error = err.message;
      state.finishedAt = new Date().toISOString();
      pushLog(`❌ ${err.message}`);
    }
  })();

  return NextResponse.json(state);
}
