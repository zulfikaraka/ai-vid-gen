import { NextResponse } from "next/server";
import { polishVideoMetadata } from "@/lib/ai";
import { getEpisode, saveVideoMetadata } from "@/lib/store";

export async function POST(request) {
  try {
    const body = await request.json();
    const { episodeId, kind, moduleId, title, description, tags, instruction, channelName, provider = "auto" } = body;
    if (!episodeId || !kind) {
      return NextResponse.json({ error: "episodeId dan kind wajib diisi" }, { status: 400 });
    }

    const ep = getEpisode(episodeId);
    if (!ep) return NextResponse.json({ error: "Episode not found" }, { status: 404 });

    let narrationContext = "";
    if (kind === "long") {
      narrationContext = [
        ...(ep.episode.intro?.beats || []),
        ...(ep.episode.modules || []).flatMap((m) => m.beats || []),
        ...(ep.episode.outro?.beats || []),
      ]
        .map((b) => b.narration)
        .filter(Boolean)
        .join(" ");
    } else {
      const mod = (ep.episode.modules || []).find((m) => m.id === moduleId);
      narrationContext = (mod?.beats || []).map((b) => b.narration).filter(Boolean).join(" ");
    }

    const { parsed, provider: usedProvider } = await polishVideoMetadata({
      kind,
      title,
      description,
      tags,
      narrationContext: narrationContext.slice(0, 2000),
      instruction,
      channelName: channelName || "Sains 60 Detik",
      provider,
    });

    const updatedEpisode = saveVideoMetadata(episodeId, kind, moduleId, {
      title: parsed.title || title,
      description: parsed.description || description,
      tags: Array.isArray(parsed.tags) ? parsed.tags : tags,
      hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : undefined,
    });

    return NextResponse.json({
      polished: {
        title: parsed.title || title,
        description: parsed.description || description,
        tags: Array.isArray(parsed.tags) ? parsed.tags : tags,
        hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : undefined,
      },
      provider: usedProvider,
      episode: updatedEpisode,
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
