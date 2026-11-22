import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { EPISODES_DIR, getEpisode, safeId } from "@/lib/store";

export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const cleanId = safeId(id);
    const formData = await request.formData();
    const file = formData.get("file");
    const targetSubdir = formData.get("subdir") === "clips" ? "clips" : "stills";
    const targetName = String(formData.get("fileName") || file?.name || "").replace(/[^a-zA-Z0-9._-]/g, "_");

    if (!file || typeof file.arrayBuffer !== "function" || !targetName) {
      return NextResponse.json({ error: "File tidak valid" }, { status: 400 });
    }

    const destDir = path.join(EPISODES_DIR, cleanId, "assets", targetSubdir);
    fs.mkdirSync(destDir, { recursive: true });
    const buf = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(destDir, targetName), buf);

    return NextResponse.json({
      success: true,
      savedPath: `assets/${targetSubdir}/${targetName}`,
      episode: getEpisode(cleanId),
    });
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
