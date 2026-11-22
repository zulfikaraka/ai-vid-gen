#!/usr/bin/env node
/**
 * Proof & Myth — YouTube Data API v3 Episode Uploader (Long-Form 16:9 + Shorts 9:16)
 *
 * Usage:
 *   node scripts/youtube_upload.mjs episodes/ep01_mitos_charging_hp [options]
 *
 * Options:
 *   --only <all|long|shorts>    Which deliverables to upload (default: all)
 *   --module <module_id>        Upload only a specific Short module (implies --only shorts)
 *   --privacy <public|unlisted|private>  Video privacy status (default: public)
 *   --schedule <ISO-8601>       Schedule publish time (e.g. 2026-11-22T18:00:00+07:00)
 *                               Note: YouTube requires privacyStatus="private" with publishAt.
 *   --stagger-hours <N>         When --schedule is set, stagger each subsequent upload by N hours
 *   --category <id>             YouTube categoryId (default: 28 = Science & Technology)
 *   --thumbnail <path>          Custom thumbnail image for Long-Form 16:9 (auto-detects output/thumbnail.{jpg,png})
 *   --dry-run                   Preview metadata, chapters, and files without uploading
 *   --force                     Re-upload even if already recorded in output/youtube_uploads.json
 */
import fs from "node:fs";
import path from "node:path";
import { getAuthenticatedYouTubeClient } from "./lib/youtube_client.mjs";

function parseArgs(argv) {
  const opts = {
    episodeDir: null,
    only: "all",
    moduleId: null,
    privacy: "public",
    schedule: null,
    shortsSchedule: null,
    staggerHours: 0,
    category: "28",
    thumbnail: null,
    dryRun: false,
    force: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--") && !opts.episodeDir) {
      opts.episodeDir = a;
    } else if (a === "--only") {
      opts.only = (argv[++i] || "all").toLowerCase();
    } else if (a === "--module") {
      opts.moduleId = argv[++i] || null;
      opts.only = "shorts";
    } else if (a === "--privacy") {
      opts.privacy = (argv[++i] || "public").toLowerCase();
    } else if (a === "--schedule") {
      opts.schedule = argv[++i] || null;
    } else if (a === "--shorts-schedule") {
      opts.shortsSchedule = argv[++i] || null;
    } else if (a === "--stagger-hours") {
      opts.staggerHours = Number(argv[++i] || 0);
    } else if (a === "--category") {
      opts.category = String(argv[++i] || "28");
    } else if (a === "--thumbnail") {
      opts.thumbnail = argv[++i] || null;
    } else if (a === "--dry-run") {
      opts.dryRun = true;
    } else if (a === "--force") {
      opts.force = true;
    } else if (a === "--help" || a === "-h") {
      printUsage();
      process.exit(0);
    }
  }
  return opts;
}

function printUsage() {
  console.log(`Usage:
  node scripts/youtube_upload.mjs <episode-dir> [options]

Options:
  --only <all|long|shorts>            Deliverables to upload (default: all)
  --module <module_id>                Upload only one Short module
  --privacy <public|unlisted|private> Default: public
  --schedule <ISO-8601>               Schedule publishAt (e.g. 2026-11-22T18:00:00+07:00)
  --stagger-hours <N>                 Stagger subsequent uploads by N hours when scheduling
  --category <id>                     YouTube categoryId (default: 28 Science & Technology)
  --thumbnail <path>                  Custom thumbnail for Long-Form 16:9
  --dry-run                           Preview upload plan without calling YouTube API
  --force                             Re-upload even if already present in youtube_uploads.json`);
}

function fmtTimestamp(totalSec) {
  const s = Math.max(0, Math.floor(totalSec));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function sumBeatDurations(beats = []) {
  return beats.reduce((acc, b) => acc + Number(b.duration || 4), 0);
}

function buildChapters(episode) {
  const chapters = [];
  let cursor = 0;

  if (episode.intro?.beats?.length) {
    chapters.push({ time: cursor, label: "Intro" });
    cursor += sumBeatDurations(episode.intro.beats);
  }
  for (const mod of episode.modules || []) {
    chapters.push({ time: cursor, label: mod.title || mod.id });
    cursor += sumBeatDurations(mod.beats);
  }
  if (episode.outro?.beats?.length) {
    chapters.push({ time: cursor, label: "Kesimpulan" });
    cursor += sumBeatDurations(episode.outro.beats);
  }
  return chapters;
}

function buildLongMetadata(episode, opts) {
  const custom = episode.youtube?.long || {};
  const title = (custom.title || episode.title || episode.id).slice(0, 100);
  const chapters = buildChapters(episode);
  const chapterLines = chapters.map((c) => `${fmtTimestamp(c.time)} ${c.label}`).join("\n");

  const introSummary = (episode.intro?.beats || [])
    .map((b) => b.narration)
    .filter(Boolean)
    .join(" ");

  const defaultHashtags = ["#ProofAndMyth", "#Sains", "#FaktaSains", "#Teknologi"];
  const hashtags = (custom.hashtags || defaultHashtags).map((h) => (h.startsWith("#") ? h : `#${h}`));

  const description = (
    custom.description ||
    [
      introSummary || episode.title,
      "",
      "Chapters:",
      chapterLines,
      "",
      "Tulis di kolom komentar mitos teknologi atau sains apa lagi yang ingin kamu buktikan di episode berikutnya!",
      "",
      hashtags.join(" "),
    ].join("\n")
  ).slice(0, 5000);

  const tags = custom.tags || [
    "Proof & Myth",
    "fakta sains",
    "mitos teknologi",
    "edukasi sains",
    ...hashtags.map((h) => h.replace(/^#/, "")),
  ];

  return {
    title,
    description,
    tags: [...new Set(tags.filter(Boolean))],
    categoryId: String(custom.categoryId || episode.youtube?.categoryId || opts.category || "28"),
  };
}

function buildShortMetadata(episode, mod, opts, longVideoUrl = null) {
  const custom = mod.youtube || {};
  const rawTitle = custom.title || mod.title || `${episode.title} — ${mod.id}`;
  const title = rawTitle.slice(0, 100);

  const firstNarration = mod.beats?.[0]?.narration || mod.title || "";
  const lastNarration = mod.beats?.[mod.beats.length - 1]?.narration || "";
  const summary =
    firstNarration && lastNarration && firstNarration !== lastNarration
      ? `${firstNarration}\n\n${lastNarration}`
      : firstNarration;

  const baseHashtags = (custom.hashtags || ["#Shorts", "#ProofAndMyth", "#FaktaSains", "#Mitos"]).map((h) =>
    h.startsWith("#") ? h : `#${h}`
  );
  if (!baseHashtags.some((h) => h.toLowerCase() === "#shorts")) {
    baseHashtags.unshift("#Shorts");
  }

  const lines = [summary];
  if (longVideoUrl) {
    lines.push("", `Tonton versi lengkapnya di sini: ${longVideoUrl}`);
  }
  lines.push("", baseHashtags.join(" "));

  const description = (custom.description || lines.join("\n")).slice(0, 5000);

  const tags = custom.tags || [
    "Shorts",
    "Proof & Myth",
    "fakta sains",
    "mitos",
    ...baseHashtags.map((h) => h.replace(/^#/, "")),
  ];

  return {
    title,
    description,
    tags: [...new Set(tags.filter(Boolean))],
    categoryId: String(custom.categoryId || episode.youtube?.categoryId || opts.category || "28"),
  };
}

function findLongVideo(outputDir) {
  if (!fs.existsSync(outputDir)) return null;
  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".mp4"));
  const match = files.find((f) => /long.*16x9\.mp4$/i.test(f)) || files.find((f) => /16x9\.mp4$/i.test(f));
  return match ? path.join(outputDir, match) : null;
}

function findShortVideo(outputDir, modId) {
  if (!fs.existsSync(outputDir)) return null;
  const files = fs.readdirSync(outputDir).filter((f) => f.endsWith(".mp4"));
  const exact = files.find((f) => f.includes(modId) && /9x16\.mp4$/i.test(f));
  return exact ? path.join(outputDir, exact) : null;
}

function findThumbnail(outputDir, explicitPath) {
  if (explicitPath) {
    const resolved = path.resolve(explicitPath);
    if (!fs.existsSync(resolved)) {
      throw new Error(`Thumbnail file not found: ${resolved}`);
    }
    return resolved;
  }
  for (const name of ["thumbnail.jpg", "thumbnail.jpeg", "thumbnail.png"]) {
    const p = path.join(outputDir, name);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function buildStatus(privacy, scheduleDate) {
  if (scheduleDate) {
    if (isNaN(scheduleDate.getTime()) || scheduleDate.getTime() <= Date.now() + 60_000) {
      throw new Error(`--schedule must be a valid future ISO-8601 timestamp (> 1 min from now).`);
    }
    return {
      privacyStatus: "private",
      publishAt: scheduleDate.toISOString(),
      selfDeclaredMadeForKids: false,
    };
  }
  if (!["public", "unlisted", "private"].includes(privacy)) {
    throw new Error(`Invalid --privacy "${privacy}". Use public, unlisted, or private.`);
  }
  return {
    privacyStatus: privacy,
    selfDeclaredMadeForKids: false,
  };
}

async function uploadVideo(youtube, { filePath, metadata, status, thumbnailPath }) {
  const fileSize = fs.statSync(filePath).size;
  const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
  console.log(`\n⬆ Uploading ${path.basename(filePath)} (${sizeMB} MB)...`);
  console.log(`   Title   : ${metadata.title}`);
  console.log(`   Privacy : ${status.publishAt ? `scheduled (${status.publishAt})` : status.privacyStatus}`);

  let lastPct = -1;
  const res = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: metadata.title,
          description: metadata.description,
          tags: metadata.tags,
          categoryId: metadata.categoryId,
        },
        status,
      },
      media: {
        body: fs.createReadStream(filePath),
      },
    },
    {
      onUploadProgress: (evt) => {
        if (!fileSize) return;
        const pct = Math.min(100, Math.floor((evt.bytesRead / fileSize) * 100));
        if (pct >= lastPct + 10 || pct === 100) {
          lastPct = pct;
          process.stdout.write(`   Progress: ${pct}%\r`);
        }
      },
    }
  );
  process.stdout.write("\n");

  const videoId = res.data.id;
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  console.log(`✅ Uploaded: ${url}`);

  if (thumbnailPath) {
    console.log(`🖼 Setting custom thumbnail: ${path.basename(thumbnailPath)}...`);
    await youtube.thumbnails.set({
      videoId,
      media: { body: fs.createReadStream(thumbnailPath) },
    });
    console.log("   ✅ Thumbnail set.");
  }

  return {
    videoId,
    url,
    title: metadata.title,
    privacyStatus: status.privacyStatus,
    publishAt: status.publishAt || null,
    file: path.basename(filePath),
    uploadedAt: new Date().toISOString(),
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (!opts.episodeDir) {
    printUsage();
    process.exit(1);
  }

  const absEpDir = path.resolve(opts.episodeDir);
  const epJsonPath = path.join(absEpDir, "episode.json");
  if (!fs.existsSync(epJsonPath)) {
    throw new Error(`episode.json not found at: ${epJsonPath}`);
  }

  const episode = JSON.parse(fs.readFileSync(epJsonPath, "utf8"));
  const outputDir = path.join(absEpDir, "output");
  const manifestPath = path.join(outputDir, "youtube_uploads.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { episodeId: episode.id, long: null, shorts: {} };

  const baseSchedule = opts.schedule ? new Date(opts.schedule) : null;
  const baseShortsSchedule = opts.shortsSchedule ? new Date(opts.shortsSchedule) : null;
  let scheduleSlot = 0;
  let shortsSlot = 0;
  const nextLongScheduleDate = () => {
    if (!baseSchedule) return null;
    const d = new Date(baseSchedule.getTime() + scheduleSlot * opts.staggerHours * 3600 * 1000);
    scheduleSlot++;
    return d;
  };
  const nextShortScheduleDate = () => {
    if (baseShortsSchedule) {
      const d = new Date(baseShortsSchedule.getTime() + shortsSlot * opts.staggerHours * 3600 * 1000);
      shortsSlot++;
      return d;
    }
    if (!baseSchedule) return null;
    const d = new Date(baseSchedule.getTime() + scheduleSlot * opts.staggerHours * 3600 * 1000);
    scheduleSlot++;
    return d;
  };

  // Build upload queue
  const queue = [];

  if (opts.only === "all" || opts.only === "long") {
    const longFile = findLongVideo(outputDir);
    if (!longFile) {
      console.warn(`⚠ Long-form 16:9 MP4 not found in ${outputDir}`);
    } else if (manifest.long && !opts.force) {
      console.log(`⏭ Skipping Long-Form (already uploaded: ${manifest.long.url}). Use --force to re-upload.`);
    } else {
      const thumb = findThumbnail(outputDir, opts.thumbnail);
      queue.push({
        kind: "long",
        key: "long",
        filePath: longFile,
        thumbnailPath: thumb,
        metadata: buildLongMetadata(episode, opts),
        status: buildStatus(opts.privacy, nextLongScheduleDate()),
      });
    }
  }

  if (opts.only === "all" || opts.only === "shorts") {
    const modules = (episode.modules || []).filter((m) => !opts.moduleId || m.id === opts.moduleId);
    for (const mod of modules) {
      const shortFile = findShortVideo(outputDir, mod.id);
      if (!shortFile) {
        console.warn(`⚠ Short 9:16 MP4 not found for module "${mod.id}" in ${outputDir}`);
        continue;
      }
      if (manifest.shorts?.[mod.id] && !opts.force) {
        console.log(`⏭ Skipping Short "${mod.id}" (already uploaded: ${manifest.shorts[mod.id].url}).`);
        continue;
      }
      queue.push({
        kind: "short",
        key: mod.id,
        mod,
        filePath: shortFile,
        thumbnailPath: null,
        metadata: buildShortMetadata(episode, mod, opts, manifest.long?.url || null),
        status: buildStatus(opts.privacy, nextShortScheduleDate()),
      });
    }
  }

  if (queue.length === 0) {
    console.log("\nNothing to upload.");
    return;
  }

  console.log(`\n=== YouTube Upload Plan: ${episode.id} (${queue.length} video(s)) ===`);
  for (const job of queue) {
    const sizeMB = (fs.statSync(job.filePath).size / (1024 * 1024)).toFixed(2);
    console.log(`\n[${job.kind.toUpperCase()}] ${path.basename(job.filePath)} (${sizeMB} MB)`);
    console.log(`  Title      : ${job.metadata.title}`);
    console.log(`  Category   : ${job.metadata.categoryId}`);
    console.log(`  Privacy    : ${job.status.publishAt ? `scheduled @ ${job.status.publishAt}` : job.status.privacyStatus}`);
    if (job.thumbnailPath) console.log(`  Thumbnail  : ${job.thumbnailPath}`);
    console.log(`  Tags       : ${job.metadata.tags.join(", ")}`);
    console.log(`  Description:\n    ${job.metadata.description.replace(/\n/g, "\n    ")}`);
  }

  if (opts.dryRun) {
    console.log("\n✅ Dry-run complete. No videos were uploaded.");
    return;
  }

  const { youtube, channel } = getAuthenticatedYouTubeClient();
  if (channel) {
    console.log(`\nAuthenticated channel: ${channel.title} (${channel.id})`);
  }

  let uploadedLongUrl = manifest.long?.url || null;

  for (const job of queue) {
    // If Long-Form was just uploaded in this same run, inject its URL into Shorts descriptions!
    if (job.kind === "short" && uploadedLongUrl && !job.metadata.description.includes(uploadedLongUrl)) {
      job.metadata = buildShortMetadata(episode, job.mod, opts, uploadedLongUrl);
    }

    const result = await uploadVideo(youtube, job);
    if (job.kind === "long") {
      manifest.long = result;
      uploadedLongUrl = result.url;
    } else {
      manifest.shorts = manifest.shorts || {};
      manifest.shorts[job.key] = result;
    }
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  }

  console.log(`\n🎉 Done! Upload manifest saved to: ${manifestPath}`);
}

main().catch((err) => {
  console.error("\n❌ Upload failed:", err.message);
  process.exit(1);
});
