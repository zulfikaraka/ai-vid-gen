import fs from "node:fs";
import path from "node:path";
import { google } from "googleapis";
import {
  EPISODES_DIR,
  getAccounts,
  getEpisode,
  recordUpload,
  upsertYoutubeAccount,
} from "./store.js";

const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/youtube/callback";
const SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

export function createOAuth2Client() {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const redirectUri = (process.env.YOUTUBE_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();
  if (!clientId || !clientSecret) {
    throw new Error("YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET belum diisi di ai-vid-gen/.env");
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function generateYoutubeAuthUrl() {
  const oauth2Client = createOAuth2Client();
  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent select_account",
    scope: SCOPES,
    state: "ai_vid_gen_dashboard_oauth",
  });
}

export async function handleYoutubeCallback(code) {
  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  const channelRes = await youtube.channels.list({
    part: ["snippet", "statistics"],
    mine: true,
  });

  const ch = channelRes.data.items?.[0];
  if (!ch) throw new Error("Tidak ditemukan channel YouTube pada akun Google ini.");

  const account = {
    id: ch.id,
    title: ch.snippet?.title || "YouTube Channel",
    customUrl: ch.snippet?.customUrl || null,
    thumbnail: ch.snippet?.thumbnails?.default?.url || null,
    subscriberCount: ch.statistics?.subscriberCount || null,
    tokens,
  };
  upsertYoutubeAccount(account);
  return account;
}

export async function uploadDeliverableToYoutube({
  episodeId,
  kind,
  moduleId = null,
  channelId = null,
  privacy = "public",
  publishAt = null,
}) {
  const accounts = getAccounts();
  const channel = channelId
    ? accounts.youtube.find((c) => c.id === channelId)
    : accounts.youtube.find((c) => c.isDefault) || accounts.youtube[0];

  if (!channel) {
    throw new Error("Belum ada channel YouTube yang terkoneksi. Hubungkan dulu di menu Account.");
  }

  const ep = getEpisode(episodeId);
  if (!ep) throw new Error(`Episode tidak ditemukan: ${episodeId}`);

  const deliverable =
    kind === "long"
      ? ep.deliverables.long
      : ep.deliverables.shorts.find((s) => s.moduleId === moduleId);

  if (!deliverable) throw new Error("Video deliverable tidak ditemukan.");
  if (!deliverable.videoFile) throw new Error("File MP4 belum dirender. Jalankan Compile & Render dulu.");

  const absVideoPath = path.join(EPISODES_DIR, episodeId, deliverable.videoFile);
  if (!fs.existsSync(absVideoPath)) throw new Error(`File MP4 tidak ditemukan: ${absVideoPath}`);

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(channel.tokens);
  oauth2Client.on("tokens", (newTokens) => {
    upsertYoutubeAccount({ ...channel, tokens: newTokens });
  });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });

  let status;
  if (publishAt) {
    const dt = new Date(publishAt);
    if (isNaN(dt.getTime()) || dt.getTime() <= Date.now() + 60_000) {
      throw new Error("Waktu jadwal (publishAt) harus minimal 1 menit di masa depan.");
    }
    status = {
      privacyStatus: "private",
      publishAt: dt.toISOString(),
      selfDeclaredMadeForKids: false,
    };
  } else {
    status = {
      privacyStatus: ["public", "unlisted", "private"].includes(privacy) ? privacy : "public",
      selfDeclaredMadeForKids: false,
    };
  }

  const meta = deliverable.metadata;
  const res = await youtube.videos.insert({
    part: ["snippet", "status"],
    requestBody: {
      snippet: {
        title: (meta.title || ep.episode.title).slice(0, 100),
        description: (meta.description || "").slice(0, 5000),
        tags: meta.tags || [],
        categoryId: String(meta.categoryId || "28"),
      },
      status,
    },
    media: {
      body: fs.createReadStream(absVideoPath),
    },
  });

  const videoId = res.data.id;
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  // Upload custom thumbnail for Long-Form if output/thumbnail.{jpg,png} exists
  if (kind === "long" && deliverable.thumbnail?.startsWith("output/")) {
    const thumbAbs = path.join(EPISODES_DIR, episodeId, deliverable.thumbnail);
    if (fs.existsSync(thumbAbs)) {
      try {
        await youtube.thumbnails.set({
          videoId,
          media: { body: fs.createReadStream(thumbAbs) },
        });
      } catch {
        // non-fatal if channel hasn't verified custom thumbnails yet
      }
    }
  }

  const record = {
    videoId,
    url,
    title: meta.title,
    channelId: channel.id,
    channelName: channel.title,
    privacyStatus: status.privacyStatus,
    publishAt: status.publishAt || null,
    file: path.basename(absVideoPath),
    uploadedAt: new Date().toISOString(),
  };

  recordUpload(episodeId, kind, moduleId, record);
  return record;
}
