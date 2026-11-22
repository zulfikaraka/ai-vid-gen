import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { generateEpisodeScript } from "@/lib/ai";
import { EPISODES_DIR, saveEpisode, safeId } from "@/lib/store";

function buildPromptsMarkdown(ep) {
  const allBeats = [
    ...(ep.intro?.beats || []),
    ...(ep.modules || []).flatMap((m) => m.beats || []),
    ...(ep.outro?.beats || []),
  ];
  const stills = allBeats.filter((b) => b.visual?.kind === "still_3d");
  const clips = allBeats.filter((b) => b.visual?.kind === "veo_video");

  const lines = [
    `# ${ep.id} — Daftar Aset & Prompt Google Flow`,
    "",
    `**Topik:** ${ep.title}`,
    "",
    "## GATE 2A: Generate Gambar 3D Still",
    "",
  ];
  stills.forEach((b, i) => {
    lines.push(`### ${i + 1}. \`${b.visual.src}\``, `> ${b.visual.prompt || "(tulis prompt)"}`, "");
  });
  lines.push("---", "", "## GATE 2B: Generate Klip Veo Fast Hero Video", "");
  clips.forEach((b, i) => {
    lines.push(`### ${i + 1}. \`${b.visual.src}\``, `> ${b.visual.prompt || "(tulis prompt)"}`, "");
  });
  return lines.join("\n");
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { id, title, angle, myths = [] } = body;
    const cleanId = safeId(id);
    if (!cleanId || !title) {
      return NextResponse.json({ error: "id dan title wajib diisi" }, { status: 400 });
    }

    const { parsed, provider } = await generateEpisodeScript({ id: cleanId, title, angle, myths });
    parsed.id = cleanId;
    const saved = saveEpisode(cleanId, parsed);

    const promptsPath = path.join(EPISODES_DIR, cleanId, "google_flow_prompts.md");
    fs.writeFileSync(promptsPath, buildPromptsMarkdown(parsed), "utf8");

    return NextResponse.json({ episode: saved, provider });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
