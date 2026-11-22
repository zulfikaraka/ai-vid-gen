import { NextResponse } from "next/server";
import { getEpisode, saveEpisode, saveVideoMetadata } from "@/lib/store";

export async function GET(_request, { params }) {
  try {
    const { id } = await params;
    const ep = getEpisode(id);
    if (!ep) return NextResponse.json({ error: "Episode not found" }, { status: 404 });
    return NextResponse.json({ episode: ep });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PUT(request, { params }) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (body.action === "save_metadata") {
      const updated = saveVideoMetadata(id, body.kind, body.moduleId, {
        title: body.title,
        description: body.description,
        tags: body.tags,
      });
      return NextResponse.json({ episode: updated });
    }

    if (body.episode) {
      const updated = saveEpisode(id, body.episode);
      return NextResponse.json({ episode: updated });
    }

    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
