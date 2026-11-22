import { NextResponse } from "next/server";
import { uploadDeliverableToYoutube } from "@/lib/youtube";
import { getEpisode } from "@/lib/store";

export async function POST(request) {
  try {
    const body = await request.json();
    const { episodeId, kind, moduleId, channelId, privacy = "public", publishAt = null } = body;
    if (!episodeId || !kind) {
      return NextResponse.json({ error: "episodeId dan kind wajib diisi" }, { status: 400 });
    }

    const record = await uploadDeliverableToYoutube({
      episodeId,
      kind,
      moduleId,
      channelId,
      privacy,
      publishAt,
    });

    return NextResponse.json({
      success: true,
      record,
      episode: getEpisode(episodeId),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
