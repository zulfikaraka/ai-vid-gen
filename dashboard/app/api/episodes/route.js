import { NextResponse } from "next/server";
import { createEpisode, listEpisodes } from "@/lib/store";

export async function GET() {
  try {
    return NextResponse.json({ episodes: listEpisodes() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { id, title, pillar, angle } = body;
    if (!id || !title) {
      return NextResponse.json({ error: "id dan title wajib diisi" }, { status: 400 });
    }
    const episode = createEpisode({ id, title, pillar, angle });
    return NextResponse.json({ episode });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
