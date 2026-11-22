import { NextResponse } from "next/server";
import { generateTopicIdeas } from "@/lib/ai";

export async function POST(request) {
  try {
    const body = await request.json();
    const { pillar = "tech", customHint = "", previousTitles = [] } = body;
    const { parsed, provider } = await generateTopicIdeas({ pillar, customHint, previousTitles });
    return NextResponse.json({ ideas: parsed.ideas || [], provider });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
