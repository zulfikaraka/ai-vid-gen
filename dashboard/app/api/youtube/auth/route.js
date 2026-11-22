import { NextResponse } from "next/server";
import { generateYoutubeAuthUrl } from "@/lib/youtube";

export async function GET() {
  try {
    const url = generateYoutubeAuthUrl();
    return NextResponse.redirect(url);
  } catch (err) {
    return NextResponse.redirect(
      `http://localhost:3000/?menu=account&error=${encodeURIComponent(err.message)}`
    );
  }
}
