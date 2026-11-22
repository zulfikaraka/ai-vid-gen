import fs from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { EPISODES_DIR } from "@/lib/store";

const MIME = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function GET(request, { params }) {
  try {
    const { path: segments } = await params;
    const relPath = (segments || []).join("/");
    const absPath = path.resolve(EPISODES_DIR, relPath);

    // Prevent path traversal outside EPISODES_DIR
    if (!absPath.startsWith(path.resolve(EPISODES_DIR))) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
      return new NextResponse("Not found", { status: 404 });
    }

    const stat = fs.statSync(absPath);
    const ext = path.extname(absPath).toLowerCase();
    const contentType = MIME[ext] || "application/octet-stream";
    const range = request.headers.get("range");

    if (range) {
      const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
      const start = parseInt(startStr, 10);
      const end = endStr ? parseInt(endStr, 10) : stat.size - 1;
      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(absPath, { start, end });
      return new NextResponse(stream, {
        status: 206,
        headers: {
          "Content-Range": `bytes ${start}-${end}/${stat.size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(chunkSize),
          "Content-Type": contentType,
        },
      });
    }

    const stream = fs.createReadStream(absPath);
    return new NextResponse(stream, {
      status: 200,
      headers: {
        "Content-Length": String(stat.size),
        "Content-Type": contentType,
        "Accept-Ranges": "bytes",
      },
    });
  } catch (err) {
    return new NextResponse(err.message, { status: 500 });
  }
}
