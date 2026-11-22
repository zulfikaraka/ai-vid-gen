import { NextResponse } from "next/server";
import {
  getPublicAccounts,
  removeYoutubeAccount,
  setDefaultYoutubeAccount,
} from "@/lib/store";

export async function GET() {
  try {
    return NextResponse.json({ accounts: getPublicAccounts() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  try {
    const { channelId } = await request.json();
    if (!channelId) return NextResponse.json({ error: "channelId wajib diisi" }, { status: 400 });
    setDefaultYoutubeAccount(channelId);
    return NextResponse.json({ accounts: getPublicAccounts() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function DELETE(request) {
  try {
    const { channelId } = await request.json();
    if (!channelId) return NextResponse.json({ error: "channelId wajib diisi" }, { status: 400 });
    removeYoutubeAccount(channelId);
    return NextResponse.json({ accounts: getPublicAccounts() });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
