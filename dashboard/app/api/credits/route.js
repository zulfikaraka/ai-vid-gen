import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { PROJECT_ROOT } from "@/lib/store";

function readEnvKey(keyName) {
  if (process.env[keyName]) return process.env[keyName];
  const candidates = [
    path.join(PROJECT_ROOT, ".env"),
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "hermes", ".env") : null,
  ].filter(Boolean);
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    const lines = fs.readFileSync(p, "utf8").split(/\r?\n/);
    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) continue;
      const idx = line.indexOf("=");
      const k = line.slice(0, idx).trim();
      const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
      if (k === keyName && v) return v;
    }
  }
  return "";
}

async function fetchElevenLabsCredits() {
  const apiKey = readEnvKey("ELEVENLABS_API_KEY");
  if (!apiKey) {
    return { configured: false, error: "ELEVENLABS_API_KEY belum diset" };
  }
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { configured: true, ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 120)}` };
    }
    const d = await res.json();
    const used = Number(d.character_count ?? 0);
    const limit = Number(d.character_limit ?? 0);
    const remaining = Math.max(0, limit - used);
    const nextReset = d.next_character_count_reset_unix
      ? new Date(d.next_character_count_reset_unix * 1000).toISOString()
      : null;
    return {
      configured: true,
      ok: true,
      tier: d.tier || "free",
      used,
      limit,
      remaining,
      nextReset,
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

function isFlowBusy() {
  const jobs = globalThis.__visualJobs;
  if (!jobs) return false;
  for (const job of jobs.values()) {
    if (job?.status === "running") return true;
  }
  return false;
}

function fetchFlowCredits(refresh) {
  const cached = globalThis.__flowCreditsCache || null;
  if (!refresh) {
    return cached || { synced: false, hint: "Klik Sync untuk cek kredit Flow" };
  }
  if (isFlowBusy()) {
    return {
      ...(cached || {}),
      busy: true,
      hint: "Flow sedang menjalankan job generate...",
    };
  }
  const scriptPath = path.join(PROJECT_ROOT, "scripts", "flow_generate_episode.mjs");
  const r = spawnSync("node", [scriptPath, "--mode", "status"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 35000,
    windowsHide: true,
  });
  const out = `${r.stdout || ""}\n${r.stderr || ""}`;
  const line = out.split(/\r?\n/).find((l) => l.startsWith("FLOW_STATUS_JSON:"));
  if (line) {
    try {
      const parsed = JSON.parse(line.replace("FLOW_STATUS_JSON:", ""));
      const next = {
        synced: true,
        signedIn: Boolean(parsed.signedIn),
        inProject: Boolean(parsed.inProject),
        plan: parsed.plan || null,
        credits: parsed.credits ?? null,
        hint: parsed.hint || parsed.error || null,
        updatedAt: new Date().toISOString(),
      };
      globalThis.__flowCreditsCache = next;
      return next;
    } catch {
      // fall through
    }
  }
  return {
    ...(cached || {}),
    synced: false,
    error: (r.stderr || r.stdout || "Gagal membaca kredit Flow").slice(-200),
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const refreshFlow = url.searchParams.get("refreshFlow") === "1";
  const skipElevenLabs = url.searchParams.get("onlyFlow") === "1";

  const [elevenlabs, flow] = await Promise.all([
    skipElevenLabs ? Promise.resolve(null) : fetchElevenLabsCredits(),
    Promise.resolve(fetchFlowCredits(refreshFlow)),
  ]);

  return NextResponse.json({ elevenlabs, flow });
}
