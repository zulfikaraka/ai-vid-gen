#!/usr/bin/env node
/**
 * One-time local YouTube OAuth2 login for ai-vid-gen CLI uploader.
 * Spins up a temporary localhost callback server matching YOUTUBE_REDIRECT_URI
 * (default: http://localhost:3000/api/youtube/callback), saves tokens to
 * .youtube_token.json (gitignored), and prints the connected channel.
 */
import http from "node:http";
import { exec } from "node:child_process";
import { google } from "googleapis";
import {
  createOAuth2Client,
  getOAuthConfig,
  saveToken,
  TOKEN_PATH,
  YOUTUBE_SCOPES,
} from "./lib/youtube_client.mjs";

function openInBrowser(url) {
  if (process.platform === "win32") {
    exec(`start "" "${url.replace(/"/g, '\\"')}"`);
  } else if (process.platform === "darwin") {
    exec(`open "${url.replace(/"/g, '\\"')}"`);
  } else {
    exec(`xdg-open "${url.replace(/"/g, '\\"')}"`);
  }
}

async function main() {
  const { redirectUri } = getOAuthConfig();
  const parsed = new URL(redirectUri);
  const port = Number(parsed.port || (parsed.protocol === "https:" ? 443 : 80));
  const callbackPath = parsed.pathname || "/";

  const oauth2Client = createOAuth2Client();
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: YOUTUBE_SCOPES,
    state: "ai_vid_gen_youtube_oauth",
  });

  console.log("\n=== YouTube OAuth2 Setup (ai-vid-gen) ===");
  console.log(`Callback listener : ${redirectUri}`);
  console.log(`Token output file : ${TOKEN_PATH}\n`);

  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url || "/", `${parsed.protocol}//${parsed.host}`);
      if (reqUrl.pathname !== callbackPath) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const error = reqUrl.searchParams.get("error");
      const code = reqUrl.searchParams.get("code");
      const state = reqUrl.searchParams.get("state");

      if (error) {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end(`<h2>YouTube OAuth cancelled/failed</h2><p>${error}</p>`);
        console.error(`OAuth error: ${error}`);
        server.close(() => process.exit(1));
        return;
      }

      if (!code || state !== "ai_vid_gen_youtube_oauth") {
        res.writeHead(400, { "Content-Type": "text/html; charset=utf-8" });
        res.end("<h2>Invalid OAuth callback parameters</h2>");
        return;
      }

      const { tokens } = await oauth2Client.getToken(code);
      oauth2Client.setCredentials(tokens);

      const youtube = google.youtube({ version: "v3", auth: oauth2Client });
      const channelRes = await youtube.channels.list({
        part: ["snippet", "statistics"],
        mine: true,
      });

      const ch = channelRes.data.items?.[0];
      const channelInfo = ch
        ? {
            id: ch.id,
            title: ch.snippet?.title || "Unknown Channel",
            customUrl: ch.snippet?.customUrl || null,
          }
        : null;

      saveToken({ tokens, channel: channelInfo });

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(
        `<h2>YouTube Connected!</h2>` +
          `<p>Channel: <strong>${channelInfo?.title || "Unknown"}</strong> (${channelInfo?.id || "-"})</p>` +
          `<p>You can close this tab and return to your terminal.</p>`
      );

      console.log("✅ YouTube OAuth connected successfully!");
      if (channelInfo) {
        console.log(`   Channel : ${channelInfo.title} (${channelInfo.id})`);
      }
      console.log(`   Saved   : ${TOKEN_PATH}\n`);
      server.close(() => process.exit(0));
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`OAuth exchange failed: ${err.message}`);
      console.error("❌ OAuth exchange failed:", err.message);
      server.close(() => process.exit(1));
    }
  });

  server.on("error", (err) => {
    console.error(`❌ Could not listen on ${parsed.hostname}:${port} (${err.message})`);
    console.error("   Make sure no other app (e.g. Next.js on port 3000) is using that port, or change YOUTUBE_REDIRECT_URI.");
    process.exit(1);
  });

  server.listen(port, parsed.hostname, () => {
    console.log("Opening browser for Google sign-in...");
    console.log(`If it doesn't open automatically, visit:\n${authUrl}\n`);
    openInBrowser(authUrl);
  });
}

main().catch((err) => {
  console.error("Fatal:", err.message);
  process.exit(1);
});
