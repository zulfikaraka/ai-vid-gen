import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { google } from "googleapis";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(__dirname, "..", "..");
export const TOKEN_PATH = path.join(PROJECT_ROOT, ".youtube_token.json");
export const DEFAULT_REDIRECT_URI = "http://localhost:3000/api/youtube/callback";
export const YOUTUBE_SCOPES = [
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.readonly",
];

// Load .env from ai-vid-gen root (does not override already-set env vars)
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

export function getOAuthConfig() {
  const clientId = process.env.YOUTUBE_CLIENT_ID?.trim();
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET?.trim();
  const redirectUri = (process.env.YOUTUBE_REDIRECT_URI || DEFAULT_REDIRECT_URI).trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      `Missing YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET in ${path.join(PROJECT_ROOT, ".env")}.\n` +
        `Copy values from Google Cloud Console (or Clipper AI .env) into ai-vid-gen/.env first.`
    );
  }
  return { clientId, clientSecret, redirectUri };
}

export function createOAuth2Client() {
  const { clientId, clientSecret, redirectUri } = getOAuthConfig();
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

export function loadSavedToken() {
  if (!fs.existsSync(TOKEN_PATH)) return null;
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function saveToken(data) {
  const existing = loadSavedToken() || {};
  const merged = {
    ...existing,
    ...data,
    tokens: {
      ...(existing.tokens || {}),
      ...(data.tokens || {}),
    },
    updated_at: new Date().toISOString(),
  };
  // Preserve existing refresh_token if Google omits it on refresh/re-consent
  if (!merged.tokens.refresh_token && existing.tokens?.refresh_token) {
    merged.tokens.refresh_token = existing.tokens.refresh_token;
  }
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(merged, null, 2), "utf8");
  return merged;
}

export function getAuthenticatedYouTubeClient() {
  const saved = loadSavedToken();
  if (!saved?.tokens?.access_token && !saved?.tokens?.refresh_token) {
    throw new Error(
      `YouTube OAuth token not found at ${TOKEN_PATH}.\n` +
        `Run "npm run youtube:auth" first to sign in to your YouTube channel.`
    );
  }

  const oauth2Client = createOAuth2Client();
  oauth2Client.setCredentials(saved.tokens);

  oauth2Client.on("tokens", (newTokens) => {
    saveToken({ tokens: newTokens });
  });

  const youtube = google.youtube({ version: "v3", auth: oauth2Client });
  return { youtube, oauth2Client, channel: saved.channel || null };
}
