import { NextResponse } from "next/server";
import { handleYoutubeCallback } from "@/lib/youtube";

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `http://localhost:3000/?menu=account&error=${encodeURIComponent(error)}`
    );
  }
  if (!code) {
    return NextResponse.redirect(
      `http://localhost:3000/?menu=account&error=${encodeURIComponent("Missing OAuth code")}`
    );
  }

  try {
    const channel = await handleYoutubeCallback(code);
    return NextResponse.redirect(
      `http://localhost:3000/?menu=account&connected=${encodeURIComponent(channel.title)}`
    );
  } catch (err) {
    return NextResponse.redirect(
      `http://localhost:3000/?menu=account&error=${encodeURIComponent(err.message)}`
    );
  }
}
