import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { PROJECT_ROOT } from "@/lib/store";

const ENV_PATH = path.join(PROJECT_ROOT, ".env");
const ALLOWED_ENV_KEYS = new Set([
  "ELEVENLABS_API_KEY",
  "ELEVENLABS_VOICE_ID",
  "FLOW_PROJECT_ID",
  "GEMINI_API_KEY",
  "GROQ_API_KEY",
]);

function readEnvFile(filePath) {
  const map = {};
  if (!fs.existsSync(filePath)) return map;
  for (const raw of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const idx = line.indexOf("=");
    const k = line.slice(0, idx).trim();
    const v = line.slice(idx + 1).trim().replace(/^["']|["']$/g, "");
    if (k) map[k] = v;
  }
  return map;
}

function getEffectiveKey(keyName, envMap) {
  return envMap[keyName] || process.env[keyName] || "";
}

function maskSecret(val) {
  if (!val) return "";
  if (val.length <= 8) return "••••••••";
  return `${val.slice(0, 4)}••••${val.slice(-4)}`;
}

function upsertEnvKeys(updates) {
  const existingLines = fs.existsSync(ENV_PATH)
    ? fs.readFileSync(ENV_PATH, "utf8").split(/\r?\n/)
    : [];
  const remaining = { ...updates };
  const nextLines = existingLines.map((line) => {
    const trimmed = line.trim();
    // Match active or commented key lines (e.g. "# ELEVENLABS_API_KEY=...")
    for (const [k, v] of Object.entries(remaining)) {
      const activeRe = new RegExp(`^\\s*${k}\\s*=`);
      const commentedRe = new RegExp(`^\\s*#\\s*${k}\\s*=`);
      if (activeRe.test(trimmed) || commentedRe.test(trimmed)) {
        delete remaining[k];
        return v ? `${k}=${v}` : `# ${k}=`;
      }
    }
    return line;
  });

  for (const [k, v] of Object.entries(remaining)) {
    if (v) nextLines.push(`${k}=${v}`);
  }

  fs.writeFileSync(ENV_PATH, nextLines.join("\n").replace(/\n*$/, "\n"), "utf8");
  for (const [k, v] of Object.entries(updates)) {
    if (v) process.env[k] = v;
    else delete process.env[k];
  }
}

async function testElevenLabs(apiKey) {
  if (!apiKey) return { configured: false, ok: false };
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user/subscription", {
      headers: { "xi-api-key": apiKey },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { configured: true, ok: false, error: `HTTP ${res.status}: ${txt.slice(0, 140)}` };
    }
    const d = await res.json();
    const used = Number(d.character_count ?? 0);
    const limit = Number(d.character_limit ?? 0);
    return {
      configured: true,
      ok: true,
      tier: d.tier || "free",
      used,
      limit,
      remaining: Math.max(0, limit - used),
      nextReset: d.next_character_count_reset_unix
        ? new Date(d.next_character_count_reset_unix * 1000).toISOString()
        : null,
    };
  } catch (err) {
    return { configured: true, ok: false, error: err.message };
  }
}

function runFlowStatus() {
  const jobs = globalThis.__visualJobs;
  if (jobs) {
    for (const job of jobs.values()) {
      if (job?.status === "running") {
        return {
          ...(globalThis.__flowCreditsCache || {}),
          busy: true,
          hint: "Chrome Flow sedang menjalankan job generate. Tunggu hingga selesai.",
        };
      }
    }
  }
  const scriptPath = path.join(PROJECT_ROOT, "scripts", "flow_generate_episode.mjs");
  const r = spawnSync("node", [scriptPath, "--mode", "status"], {
    cwd: PROJECT_ROOT,
    encoding: "utf8",
    timeout: 40000,
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
        url: parsed.url || null,
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
    synced: false,
    signedIn: false,
    inProject: false,
    error: (r.stderr || r.stdout || "Gagal menghubungi Chrome Flow").slice(-250),
  };
}

async function buildPayload(refreshFlow = false) {
  const envMap = readEnvFile(ENV_PATH);
  const elKey = getEffectiveKey("ELEVENLABS_API_KEY", envMap);
  const geminiKey = getEffectiveKey("GEMINI_API_KEY", envMap);
  const groqKey = getEffectiveKey("GROQ_API_KEY", envMap);
  const elVoice = getEffectiveKey("ELEVENLABS_VOICE_ID", envMap) || "CwhRBWXzGAHq8TQ4Fs17";
  const flowProjectId = getEffectiveKey("FLOW_PROJECT_ID", envMap) || "75f37628-085c-4e79-845f-94b6597b771a";
  const agyBin = getEffectiveKey("AGY_BIN", envMap) || "";

  const elevenlabs = await testElevenLabs(elKey);
  const flow = refreshFlow
    ? runFlowStatus()
    : globalThis.__flowCreditsCache || { synced: false, hint: "Klik Sync / Buka Chrome Flow untuk cek status login & kredit." };

  return {
    flow: {
      ...flow,
      projectId: flowProjectId,
    },
    elevenlabs: {
      ...elevenlabs,
      maskedKey: maskSecret(elKey),
      voiceId: elVoice,
    },
    aiProviders: {
      gemini: {
        configured: Boolean(geminiKey && !geminiKey.startsWith("your_")),
        maskedKey: geminiKey && !geminiKey.startsWith("your_") ? maskSecret(geminiKey) : "",
      },
      groq: {
        configured: Boolean(groqKey && !groqKey.startsWith("your_")),
        maskedKey: groqKey && !groqKey.startsWith("your_") ? maskSecret(groqKey) : "",
      },
      antigravity: {
        configured: Boolean(agyBin && fs.existsSync(agyBin)),
        path: agyBin || "Auto (PATH)",
      },
    },
  };
}

export async function GET(request) {
  const url = new URL(request.url);
  const refreshFlow = url.searchParams.get("refreshFlow") === "1";
  const data = await buildPayload(refreshFlow);
  return NextResponse.json(data);
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const action = body.action || "save_env";

    if (action === "flow_sync" || action === "flow_open") {
      const data = await buildPayload(true);
      return NextResponse.json(data);
    }

    if (action === "save_env") {
      const updates = {};
      for (const [k, v] of Object.entries(body.values || {})) {
        if (!ALLOWED_ENV_KEYS.has(k)) continue;
        updates[k] = String(v ?? "").trim();
      }
      if (Object.keys(updates).length === 0) {
        return NextResponse.json({ error: "Tidak ada key valid untuk disimpan." }, { status: 400 });
      }
      upsertEnvKeys(updates);
      const data = await buildPayload(false);
      return NextResponse.json({ saved: Object.keys(updates), ...data });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
