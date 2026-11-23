import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

// dashboard/ sits inside ai-vid-gen/
export const DASHBOARD_ROOT = process.cwd();
export const PROJECT_ROOT = path.resolve(DASHBOARD_ROOT, "..");
export const EPISODES_DIR = path.join(PROJECT_ROOT, "episodes");
export const DATA_DIR = path.join(DASHBOARD_ROOT, "data");
export const ACCOUNTS_PATH = path.join(DATA_DIR, "accounts.json");
export const LEGACY_TOKEN_PATH = path.join(PROJECT_ROOT, ".youtube_token.json");

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

export function safeId(str = "") {
  return String(str).replace(/[^a-zA-Z0-9_-]/g, "");
}

export function fmtTimestamp(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = s % 60;
  if (hrs > 0) {
    return `${hrs}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  }
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function sumBeatDurations(beats = []) {
  return beats.reduce((acc, b) => acc + Number(b.duration || 4), 0);
}

export function buildChapters(episode) {
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

export function buildLongMetadata(episode) {
  const custom = episode.youtube?.long || {};
  const title = (custom.title || episode.title || episode.id).slice(0, 100);
  const chapters = buildChapters(episode);
  const chapterLines = chapters.map((c) => `${fmtTimestamp(c.time)} ${c.label}`).join("\n");
  const introSummary = (episode.intro?.beats || [])
    .map((b) => b.narration)
    .filter(Boolean)
    .join(" ");

  const defaultHashtags = ["#Sains60Detik", "#FaktaSains", "#MitosVsFakta", "#Edukasi"];
  const hashtags = (custom.hashtags || defaultHashtags).map((h) => (h.startsWith("#") ? h : `#${h}`));

  const description = (
    custom.description ||
    [
      introSummary || episode.title,
      "",
      "Chapters:",
      chapterLines,
      "",
      "Tulis di kolom komentar mitos apa lagi yang ingin kita buktikan di episode berikutnya!",
      "",
      hashtags.join(" "),
    ].join("\n")
  ).slice(0, 5000);

  const tags = custom.tags || [
    "Sains 60 Detik",
    "fakta sains",
    "mitos vs fakta",
    "edukasi sains",
    ...hashtags.map((h) => h.replace(/^#/, "")),
  ];

  return {
    title,
    description,
    tags: [...new Set(tags.filter(Boolean))],
    categoryId: String(custom.categoryId || episode.youtube?.categoryId || "28"),
  };
}

export function buildShortMetadata(episode, mod, longUrl = null) {
  const custom = mod.youtube || {};
  const title = (custom.title || mod.title || `${episode.title} — ${mod.id}`).slice(0, 100);
  const firstNarration = mod.beats?.[0]?.narration || mod.title || "";
  const lastNarration = mod.beats?.[mod.beats.length - 1]?.narration || "";
  const summary =
    firstNarration && lastNarration && firstNarration !== lastNarration
      ? `${firstNarration}\n\n${lastNarration}`
      : firstNarration;

  const baseHashtags = (custom.hashtags || ["#Shorts", "#Sains60Detik", "#FaktaSains", "#Mitos"]).map((h) =>
    h.startsWith("#") ? h : `#${h}`
  );
  if (!baseHashtags.some((h) => h.toLowerCase() === "#shorts")) {
    baseHashtags.unshift("#Shorts");
  }

  const lines = [summary];
  if (longUrl) {
    lines.push("", `Tonton versi lengkapnya di sini: ${longUrl}`);
  }
  lines.push("", baseHashtags.join(" "));

  const description = (custom.description || lines.join("\n")).slice(0, 5000);
  const tags = custom.tags || [
    "Shorts",
    "Sains 60 Detik",
    "fakta sains",
    "mitos",
    ...baseHashtags.map((h) => h.replace(/^#/, "")),
  ];

  return {
    title,
    description,
    tags: [...new Set(tags.filter(Boolean))],
    categoryId: String(custom.categoryId || episode.youtube?.categoryId || "28"),
  };
}

function findFiles(dir, extList) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => extList.some((e) => f.toLowerCase().endsWith(e)))
    .sort()
    .map((name) => {
      const full = path.join(dir, name);
      const stat = fs.statSync(full);
      return { name, size: stat.size, mtime: stat.mtime.toISOString() };
    });
}

function findLongVideoFile(outputDir) {
  const mp4s = findFiles(outputDir, [".mp4"]);
  return mp4s.find((f) => /long.*16x9\.mp4$/i.test(f.name)) || mp4s.find((f) => /16x9\.mp4$/i.test(f.name)) || null;
}

function findShortVideoFile(outputDir, modId) {
  const mp4s = findFiles(outputDir, [".mp4"]);
  return mp4s.find((f) => f.name.includes(modId) && /9x16\.mp4$/i.test(f.name)) || null;
}

function findThumbnailFile(epDir, outputDir, preferredStillSrc) {
  for (const name of ["thumbnail.jpg", "thumbnail.jpeg", "thumbnail.png"]) {
    if (fs.existsSync(path.join(outputDir, name))) {
      return `output/${name}`;
    }
  }
  if (preferredStillSrc && fs.existsSync(path.join(epDir, preferredStillSrc))) {
    return preferredStillSrc;
  }
  const stills = findFiles(path.join(epDir, "assets", "stills"), [".png", ".jpg", ".jpeg", ".webp"]);
  return stills[0] ? `assets/stills/${stills[0].name}` : null;
}

function collectRequiredAssets(episode, epDir) {
  const allBeats = [
    ...(episode.intro?.beats || []),
    ...(episode.modules || []).flatMap((m) => m.beats || []),
    ...(episode.outro?.beats || []),
  ];
  const stills = [];
  const clips = [];
  const seen = new Set();

  for (const b of allBeats) {
    const src = b.visual?.src;
    if (!src || seen.has(src)) continue;
    seen.add(src);
    const exists = fs.existsSync(path.join(epDir, src));
    const entry = {
      src,
      fileName: path.basename(src),
      kind: b.visual.kind,
      prompt: b.visual.prompt || "",
      exists,
    };
    if (b.visual.kind === "veo_video") clips.push(entry);
    else if (b.visual.kind === "still_3d") stills.push(entry);
  }
  return { stills, clips };
}

function computeUploadStatus(uploadRecord) {
  if (!uploadRecord) return { status: "not_uploaded", uploadDate: null, youtubeUrl: null, channelName: null };
  if (uploadRecord.publishAt && new Date(uploadRecord.publishAt).getTime() > Date.now()) {
    return {
      status: "scheduled",
      uploadDate: uploadRecord.publishAt,
      youtubeUrl: uploadRecord.url,
      channelName: uploadRecord.channelName || null,
    };
  }
  return {
    status: "uploaded",
    uploadDate: uploadRecord.publishAt || uploadRecord.uploadedAt,
    youtubeUrl: uploadRecord.url,
    channelName: uploadRecord.channelName || null,
  };
}

export function getEpisode(rawId) {
  const id = safeId(rawId);
  const epDir = path.join(EPISODES_DIR, id);
  const epJsonPath = path.join(epDir, "episode.json");
  if (!fs.existsSync(epJsonPath)) return null;

  const episode = JSON.parse(fs.readFileSync(epJsonPath, "utf8"));
  const outputDir = path.join(epDir, "output");
  const audioDir = path.join(epDir, "audio");
  const manifestPath = path.join(outputDir, "youtube_uploads.json");
  const uploads = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { episodeId: id, long: null, shorts: {} };

  const longFile = findLongVideoFile(outputDir);
  const longDuration =
    sumBeatDurations(episode.intro?.beats) +
    (episode.modules || []).reduce((acc, m) => acc + sumBeatDurations(m.beats), 0) +
    sumBeatDurations(episode.outro?.beats);

  const longMeta = buildLongMetadata(episode);
  const longStatus = computeUploadStatus(uploads.long);
  const firstStill = episode.intro?.beats?.find((b) => b.visual?.kind === "still_3d")?.visual?.src;

  const longDeliverable = {
    key: `${id}::long`,
    episodeId: id,
    episodeTitle: episode.title,
    kind: "long",
    moduleId: null,
    duration: Number(longDuration.toFixed(1)),
    videoFile: longFile ? `output/${longFile.name}` : null,
    videoSize: longFile?.size || 0,
    thumbnail: findThumbnailFile(epDir, outputDir, firstStill),
    metadata: longMeta,
    ...longStatus,
    uploadRecord: uploads.long || null,
  };

  const shortDeliverables = (episode.modules || []).map((mod) => {
    const sf = findShortVideoFile(outputDir, mod.id);
    const sDuration = sumBeatDurations(mod.beats);
    const sMeta = buildShortMetadata(episode, mod, uploads.long?.url || null);
    const sUpload = uploads.shorts?.[mod.id] || null;
    const sStatus = computeUploadStatus(sUpload);
    const modStill = mod.beats?.find((b) => b.visual?.kind === "still_3d")?.visual?.src;

    return {
      key: `${id}::short::${mod.id}`,
      episodeId: id,
      episodeTitle: episode.title,
      kind: "short",
      moduleId: mod.id,
      moduleTitle: mod.title,
      duration: Number(sDuration.toFixed(1)),
      videoFile: sf ? `output/${sf.name}` : null,
      videoSize: sf?.size || 0,
      thumbnail: findThumbnailFile(epDir, outputDir, modStill),
      metadata: sMeta,
      ...sStatus,
      uploadRecord: sUpload,
    };
  });

  const promptsPath = path.join(epDir, "google_flow_prompts.md");
  const promptsMd = fs.existsSync(promptsPath) ? fs.readFileSync(promptsPath, "utf8") : "";

  return {
    id,
    episode,
    promptsMd,
    audioFiles: findFiles(audioDir, [".mp3", ".wav"]),
    assets: collectRequiredAssets(episode, epDir),
    stillsFiles: findFiles(path.join(epDir, "assets", "stills"), [".png", ".jpg", ".jpeg", ".webp"]),
    clipsFiles: findFiles(path.join(epDir, "assets", "clips"), [".mp4", ".mov", ".webm"]),
    deliverables: {
      long: longDeliverable,
      shorts: shortDeliverables,
    },
  };
}

export function listEpisodes() {
  if (!fs.existsSync(EPISODES_DIR)) return [];
  const dirs = fs
    .readdirSync(EPISODES_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(EPISODES_DIR, d.name, "episode.json")))
    .map((d) => d.name)
    .sort()
    .reverse();

  return dirs.map((id) => getEpisode(id)).filter(Boolean);
}

export function createEpisode({ id, title, pillar = "tech", angle = "", watermark = "SAINS 60 DETIK" }) {
  const cleanId = safeId(id);
  if (!cleanId) throw new Error("Episode ID is required");
  const epDir = path.join(EPISODES_DIR, cleanId);
  ensureDir(path.join(epDir, "assets", "stills"));
  ensureDir(path.join(epDir, "assets", "clips"));
  ensureDir(path.join(epDir, "audio"));
  ensureDir(path.join(epDir, "output"));

  const epJsonPath = path.join(epDir, "episode.json");
  if (!fs.existsSync(epJsonPath)) {
    const initial = {
      id: cleanId,
      title: title || cleanId,
      pillar,
      angle,
      watermark,
      status: "topic_locked",
      audio: { vo: "audio/vo_master.mp3", bgm: "audio/bgm.mp3" },
      intro: { beats: [] },
      modules: [],
      outro: { beats: [] },
      youtube: { categoryId: "28", long: { title: title || cleanId } },
    };
    fs.writeFileSync(epJsonPath, JSON.stringify(initial, null, 2), "utf8");
  }
  return getEpisode(cleanId);
}

export function saveEpisode(rawId, episodeObj) {
  const id = safeId(rawId);
  const epDir = path.join(EPISODES_DIR, id);
  ensureDir(epDir);
  const epJsonPath = path.join(epDir, "episode.json");
  fs.writeFileSync(epJsonPath, JSON.stringify(episodeObj, null, 2), "utf8");
  return getEpisode(id);
}

export function saveVideoMetadata(rawId, kind, moduleId, { title, description, tags, hashtags }) {
  const id = safeId(rawId);
  const epJsonPath = path.join(EPISODES_DIR, id, "episode.json");
  if (!fs.existsSync(epJsonPath)) throw new Error(`Episode not found: ${id}`);
  const episode = JSON.parse(fs.readFileSync(epJsonPath, "utf8"));

  const cleanTags = Array.isArray(tags)
    ? tags.map((t) => String(t).trim()).filter(Boolean)
    : String(tags || "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

  const cleanHashtags = Array.isArray(hashtags)
    ? hashtags.map((h) => String(h).trim()).filter(Boolean)
    : undefined;

  if (kind === "long") {
    episode.youtube = episode.youtube || {};
    episode.youtube.long = {
      ...(episode.youtube.long || {}),
      title: String(title || "").slice(0, 100),
      description: String(description || "").slice(0, 5000),
      tags: cleanTags,
      ...(cleanHashtags ? { hashtags: cleanHashtags } : {}),
    };
  } else {
    const mod = (episode.modules || []).find((m) => m.id === moduleId);
    if (!mod) throw new Error(`Module not found: ${moduleId}`);
    mod.youtube = {
      ...(mod.youtube || {}),
      title: String(title || "").slice(0, 100),
      description: String(description || "").slice(0, 5000),
      tags: cleanTags,
      ...(cleanHashtags ? { hashtags: cleanHashtags } : {}),
    };
  }

  fs.writeFileSync(epJsonPath, JSON.stringify(episode, null, 2), "utf8");
  return getEpisode(id);
}

export function recordUpload(rawId, kind, moduleId, record) {
  const id = safeId(rawId);
  const outputDir = path.join(EPISODES_DIR, id, "output");
  ensureDir(outputDir);
  const manifestPath = path.join(outputDir, "youtube_uploads.json");
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, "utf8"))
    : { episodeId: id, long: null, shorts: {} };

  if (kind === "long") {
    manifest.long = record;
  } else {
    manifest.shorts = manifest.shorts || {};
    manifest.shorts[moduleId] = record;
  }
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), "utf8");
  return manifest;
}

// ─── Accounts (Multi-Channel YouTube + future Facebook) ──────────────────────

export function getAccounts() {
  ensureDir(DATA_DIR);
  if (!fs.existsSync(ACCOUNTS_PATH)) {
    const initial = { youtube: [], facebook: [] };
    // Auto-migrate existing CLI .youtube_token.json if present!
    if (fs.existsSync(LEGACY_TOKEN_PATH)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(LEGACY_TOKEN_PATH, "utf8"));
        if (legacy?.channel?.id && legacy?.tokens) {
          initial.youtube.push({
            id: legacy.channel.id,
            title: legacy.channel.title || "YouTube Channel",
            customUrl: legacy.channel.customUrl || null,
            thumbnail: legacy.channel.thumbnail || null,
            isDefault: true,
            connectedAt: legacy.updated_at || new Date().toISOString(),
            tokens: legacy.tokens,
          });
        }
      } catch {
        // ignore malformed legacy token
      }
    }
    fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  return JSON.parse(fs.readFileSync(ACCOUNTS_PATH, "utf8"));
}

export function saveAccounts(data) {
  ensureDir(DATA_DIR);
  fs.writeFileSync(ACCOUNTS_PATH, JSON.stringify(data, null, 2), "utf8");
  return data;
}

export function upsertYoutubeAccount(account) {
  const data = getAccounts();
  const idx = data.youtube.findIndex((c) => c.id === account.id);
  if (idx >= 0) {
    const existing = data.youtube[idx];
    const mergedTokens = { ...existing.tokens, ...account.tokens };
    if (!mergedTokens.refresh_token && existing.tokens?.refresh_token) {
      mergedTokens.refresh_token = existing.tokens.refresh_token;
    }
    data.youtube[idx] = {
      ...existing,
      ...account,
      tokens: mergedTokens,
      updatedAt: new Date().toISOString(),
    };
  } else {
    data.youtube.push({
      ...account,
      isDefault: data.youtube.length === 0,
      connectedAt: new Date().toISOString(),
    });
  }
  return saveAccounts(data);
}

export function setDefaultYoutubeAccount(channelId) {
  const data = getAccounts();
  data.youtube = data.youtube.map((c) => ({ ...c, isDefault: c.id === channelId }));
  return saveAccounts(data);
}

export function removeYoutubeAccount(channelId) {
  const data = getAccounts();
  data.youtube = data.youtube.filter((c) => c.id !== channelId);
  if (data.youtube.length > 0 && !data.youtube.some((c) => c.isDefault)) {
    data.youtube[0].isDefault = true;
  }
  return saveAccounts(data);
}

export function getPublicAccounts() {
  const data = getAccounts();
  return {
    youtube: (data.youtube || []).map(({ tokens, ...safe }) => ({
      ...safe,
      hasRefreshToken: Boolean(tokens?.refresh_token),
    })),
    facebook: (data.facebook || []).map(({ access_token, ...safe }) => safe),
  };
}
