import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import dotenv from "dotenv";
import { PROJECT_ROOT } from "./store.js";

dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

function parseJsonResponse(text) {
  let clean = String(text || "").trim();
  if (clean.includes("```")) {
    clean = clean.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  }
  const match = clean.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (match) clean = match[0];
  return JSON.parse(clean);
}

async function callGemini(prompt, systemPrompt) {
  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error("GEMINI_API_KEY not configured");

  const models = [
    ...new Set([process.env.GEMINI_MODEL?.trim(), "gemini-2.5-flash", "gemini-2.5-flash-lite"].filter(Boolean)),
  ];
  let lastErr = "Gemini failed";

  for (const model of models) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const body = {
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.75,
        responseMimeType: "application/json",
      },
    };
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] };
    }

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!text) throw new Error("Gemini returned empty response");
      return { parsed: parseJsonResponse(text), provider: `gemini:${model}` };
    }

    const errText = await res.text();
    lastErr = `Gemini (${model}) HTTP ${res.status}: ${errText.slice(0, 180)}`;
    // If billing/auth error (401/403), no point retrying other Gemini models
    if (res.status === 401 || res.status === 403) break;
  }

  throw new Error(lastErr);
}

async function listGroqChatModels(apiKey) {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const excludeRe = /whisper|guard|tts|speech|embed|moderation|safeguard|orpheus|playai|allam/i;
    return (data.data || [])
      .map((m) => m.id)
      .filter((id) => id && !excludeRe.test(id));
  } catch {
    return [];
  }
}

async function callGroq(prompt, systemPrompt) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

  const preferred = [
    process.env.GROQ_MODEL?.trim(),
    "openai/gpt-oss-120b",
    "openai/gpt-oss-20b",
    "qwen/qwen3.8-27b",
  ].filter(Boolean);

  // Discover live models on the user's Groq account so we never fail on deprecated IDs
  const liveModels = await listGroqChatModels(apiKey);
  const candidates = liveModels.length > 0
    ? [
        ...preferred.filter((m) => liveModels.includes(m)),
        ...liveModels.filter((m) => !preferred.includes(m)),
      ]
    : [...new Set(preferred)];

  let lastErr = "Groq failed";
  for (const model of candidates.slice(0, 6)) {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.75,
        response_format: { type: "json_object" },
      }),
    });

    if (res.ok) {
      const data = await res.json();
      const text = data.choices?.[0]?.message?.content;
      if (!text) throw new Error("Groq returned empty response");
      return { parsed: parseJsonResponse(text), provider: `groq:${model}` };
    }

    const errText = await res.text();
    lastErr = `Groq (${model}) HTTP ${res.status}: ${errText.slice(0, 180)}`;
    if (res.status === 401 || res.status === 403) break;
  }

  throw new Error(lastErr);
}

const AGY_TIMEOUT_MS = Number(process.env.AGY_TIMEOUT_MS || 240_000);

function resolveAgyBin() {
  if (process.env.AGY_BIN?.trim()) return process.env.AGY_BIN.trim();
  const exe = process.platform === "win32" ? "agy.exe" : "agy";
  const local = process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, "agy", "bin", exe) : null;
  if (local && fs.existsSync(local)) return local;
  return "agy";
}

/**
 * Antigravity CLI headless (`agy -p`) — memakai kuota langganan Google,
 * tanpa API key. Output dibungkus: { status, response: "<json string>" }.
 */
async function callAntigravity(prompt, systemPrompt) {
  const bin = resolveAgyBin();
  const fullPrompt = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt;
  const args = [
    "-p",
    fullPrompt,
    "--output-format",
    "json",
    "--print-timeout",
    `${Math.round(AGY_TIMEOUT_MS / 1000)}s`,
  ];
  if (process.env.AGY_MODEL?.trim()) args.push("--model", process.env.AGY_MODEL.trim());

  const raw = await new Promise((resolve, reject) => {
    const child = spawn(bin, args, { cwd: PROJECT_ROOT, windowsHide: true });
    let out = "";
    let err = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Antigravity timeout ${AGY_TIMEOUT_MS}ms`));
    }, AGY_TIMEOUT_MS + 15_000);
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`Antigravity CLI gagal dijalankan (${bin}): ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Antigravity exit ${code}: ${(err || out).slice(0, 180)}`));
        return;
      }
      resolve(out);
    });
  });

  const envelope = parseJsonResponse(raw);
  if (envelope?.status && envelope.status !== "SUCCESS") {
    throw new Error(`Antigravity status ${envelope.status}: ${String(envelope.response || "").slice(0, 180)}`);
  }
  const text = typeof envelope === "string" ? envelope : envelope?.response;
  if (!text) throw new Error("Antigravity returned empty response");
  return { parsed: parseJsonResponse(text), provider: "antigravity:agy" };
}

/**
 * Urutan provider: AI_PROVIDER_ORDER (default antigravity,groq,gemini),
 * atau pilih eksplisit via options.provider ("antigravity" | "gemini" | "groq" | "auto").
 */
export async function generateJson(prompt, systemPrompt = "", options = {}) {
  const providers = { antigravity: callAntigravity, groq: callGroq, gemini: callGemini };
  const requested = (options.provider || "auto").trim().toLowerCase();

  if (requested && requested !== "auto") {
    const fn = providers[requested];
    if (!fn) throw new Error(`Provider tidak dikenal: ${requested}`);
    return await fn(prompt, systemPrompt);
  }

  const order = (process.env.AI_PROVIDER_ORDER || "antigravity,groq,gemini")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

  const errors = [];
  for (const name of order) {
    const fn = providers[name];
    if (!fn) {
      errors.push(`${name}: provider tidak dikenal`);
      continue;
    }
    try {
      return await fn(prompt, systemPrompt);
    } catch (e) {
      errors.push(`${name}: ${e.message}`);
    }
  }

  throw new Error(
    `Semua AI provider gagal (${errors.join(" | ")}). Cek AGY_BIN / GROQ_API_KEY / AI_PROVIDER_ORDER di ai-vid-gen/.env`
  );
}

export async function generateTopicIdeas({ pillar = "tech", customHint = "", previousTitles = [] }) {
  const pillarMap = {
    tech: "Teknologi & Gadget (baterai, sinyal, pendingin, layar, AI, charger)",
    health: "Tubuh, Makanan & Kesehatan Sehari-hari (kopi, tidur, olahraga, metabolisme)",
    physics: "Fisika Benda Sekitar (pesawat, microwave, AC, kendaraan, listrik)",
    history: "Sejarah & Klaim Viral Internet yang bisa dibuktikan dengan sains",
  };
  const pillarDesc = pillarMap[pillar] || pillar;
  const avoidList = previousTitles.length ? `\nHindari mengulang judul-judul ini:\n- ${previousTitles.join("\n- ")}` : "";
  const hint = customHint ? `\nFokus / ide tambahan dari user: "${customHint}"` : "";

  const prompt = `Buat 5 ide episode video edukasi Bahasa Indonesia untuk channel "Sains 60 Detik" (format Proof & Myth: 1 Long-Form 16:9 yang berisi 3 Mitos, masing-masing bisa dipotong jadi 1 Short 9:16).
Pilar topik: ${pillarDesc}.${hint}${avoidList}

Setiap ide harus punya:
- slug: nama folder singkat lowercase underscore (misal "ep02_mitos_kopi_pagi")
- title: judul YouTube Long-Form yang menarik, penasaran, Bahasa Indonesia, max 85 karakter
- angle: ringkasan 1-2 kalimat kenapa topik ini viral & menarik secara visual 3D
- myths: array tepat 3 string (Mitos #1, Mitos #2, Mitos #3) yang masing-masing kuat berdiri sendiri sebagai YouTube Short.

Balas HANYA dengan JSON valid:
{"ideas":[{"slug":"...","title":"...","angle":"...","myths":["...","...","..."]}]}`;

  return generateJson(prompt, "Kamu adalah creative producer channel edukasi sains 3D seperti Veritasium & Elevenbyte dalam Bahasa Indonesia.");
}

export async function generateEpisodeScript({ id, title, angle, myths = [] }) {
  const mythText = myths.length ? `3 Mitos yang wajib dibahas:\n${myths.map((m, i) => `${i + 1}. ${m}`).join("\n")}` : "Buat 3 mitos terkuat untuk topik ini.";

  const prompt = `Susun blueprint lengkap episode JSON untuk HyperFrames studio ("Sains 60 Detik").
Episode ID: ${id}
Judul Utama: ${title}
Angle: ${angle || title}
${mythText}

Aturan ketat:
1. Struktur terdiri dari:
   - intro.beats: 2 beats (beat 1: still_3d studio, beat 2: veo_video cutaway)
   - modules: tepat 3 modul (mod1_..., mod2_..., mod3_...), masing-masing 4 beats:
     * beat 1: still_3d (hook mitos)
     * beat 2: veo_video (visual 3D mekanisme/bukti utama)
     * beat 3: still_3d atau veo_video (pendalaman mikroskopis)
     * beat 4: procedural (type: "stat_bars" dengan 2 items perbandingan mitos vs fakta)
   - outro.beats: 1 beat (veo_video penutup + CTA komentar)
2. Total klip veo_video di seluruh episode HARUS 5 atau 6 klip saja (hemat kredit Google Flow Veo Fast), dan still_3d 5 atau 6 gambar.
3. Setiap visual still_3d dan veo_video WAJIB memiliki field "prompt" (Bahasa Inggris, Cinema4D Octane 3D clean educational render, deep dark navy #0F172A untuk cutaway atau bright light-grey studio untuk studio, centered composition, no text, no watermark).
4. Narasi tiap beat Bahasa Indonesia natural & conversational (15-28 kata per beat), duration estimasi 5.5 - 9.0 detik.
5. Sertakan metadata SEO YouTube siap pakai:
   - youtube.long: { title (<=95 char), description (ringkas + CTA), hashtags (tanpa #Shorts), tags }
   - di tiap module: youtube: { title (<=95 char), description, hashtags (wajib ada #Shorts), tags }

Balas HANYA dengan JSON valid mengikuti skema ini:
{
  "id": "${id}",
  "title": "${title}",
  "watermark": "SAINS 60 DETIK",
  "audio": { "vo": "audio/vo_master.mp3", "bgm": "audio/bgm.mp3" },
  "intro": { "beats": [{ "duration": 6, "theme": "studio", "motion": "push-in", "narration": "...", "visual": { "kind": "still_3d", "src": "assets/stills/01_...", "prompt": "..." }, "chapter": { "line1": "...", "line2": "...", "accent": "red" } }] },
  "modules": [{ "id": "mod1_...", "title": "...", "audio_vo": "audio/vo_mod1_....mp3", "youtube": { "title": "...", "description": "...", "hashtags": ["#Shorts","#Sains60Detik"], "tags": ["..."] }, "beats": [] }],
  "outro": { "beats": [] },
  "youtube": { "categoryId": "28", "long": { "title": "...", "description": "...", "hashtags": ["#Sains60Detik"], "tags": ["..."] } }
}`;

  return generateJson(prompt, "Kamu adalah scriptwriter & visual director untuk channel edukasi sains 3D. Pastikan output JSON valid dan rapi.");
}

/**
 * Kombinasikan Title dengan #Tags persis seperti Clipper AI:
 * [Judul Catchy + Emojis] [#fyp #viral #foryou #foryoupage #Shorts ...]
 * Dipotong rapi di spasi terakhir sebelum batas maxLen (YouTube limit 100 char).
 */
export function combineTitleWithHashtags(baseTitle, rawHashtags = [], maxLen = 100, isShorts = false) {
  if (!baseTitle && (!rawHashtags || rawHashtags.length === 0)) return "";
  // Bersihkan hashtag yang mungkin sudah ada di baseTitle agar tidak duplikat
  const cleanTitle = String(baseTitle || "")
    .replace(/#[\w\d_]+/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const tags = (Array.isArray(rawHashtags) ? rawHashtags : [])
    .map((t) => (t.startsWith("#") ? t : `#${t}`))
    .filter(Boolean);

  // Daftar tag viral prioritas utama agar judul selalu memuat tag viral di depan
  const viralLeadTags = isShorts
    ? ["#fyp", "#viral", "#foryou", "#foryoupage", "#trending", "#Shorts"]
    : ["#fyp", "#viral", "#foryou", "#foryoupage", "#trending"];

  const seen = new Set();
  const prioritized = [];
  for (const t of [...viralLeadTags, ...tags]) {
    const lower = t.toLowerCase();
    if (!seen.has(lower)) {
      seen.add(lower);
      prioritized.push(t);
    }
  }

  const tagsStr = prioritized.join(" ");
  let fullText = `${cleanTitle} ${tagsStr}`.trim();

  if (fullText.length > maxLen) {
    fullText = fullText.substring(0, maxLen);
    const originalNextChar = `${cleanTitle} ${tagsStr}`.charAt(maxLen);
    if (originalNextChar !== " " && originalNextChar !== "") {
      const lastSpaceIndex = fullText.lastIndexOf(" ");
      if (lastSpaceIndex > 0) {
        fullText = fullText.substring(0, lastSpaceIndex);
      }
    }
  }

  return fullText.trim() || cleanTitle;
}

export const combineShortsTitle = combineTitleWithHashtags;

export function formatHashtagsAndTags(rawHashtags = [], rawTags = []) {
  let hashtags = (Array.isArray(rawHashtags) ? rawHashtags : [])
    .map((h) => String(h).trim().toLowerCase())
    .filter(Boolean)
    .map((h) => (h.startsWith("#") ? h : `#${h}`));

  // Tags diambil dari hashtags tanpa '#' lalu disortir alfabetis (persis Clipper AI)
  let tags = hashtags.map((h) => h.replace(/^#/, "").trim()).filter(Boolean);

  if (tags.length === 0 && Array.isArray(rawTags)) {
    tags = rawTags
      .map((t) => String(t).replace(/^#/, "").trim().toLowerCase())
      .filter(Boolean);
  }

  tags = [...new Set(tags)].sort();
  hashtags = [...new Set(hashtags)];

  return { hashtags, tags };
}

export async function polishVideoMetadata({
  kind = "short",
  title,
  description,
  tags = [],
  narrationContext = "",
  instruction = "",
  channelName = "Sains 60 Detik",
  provider = "auto",
}) {
  const isLong = kind === "long";
  const customNote = instruction
    ? `\nInstruksi revisi khusus dari user (WAJIB diprioritaskan): "${instruction}"`
    : "";

  let prompt = "";
  if (isLong) {
    prompt = `You are a world-class viral YouTube Strategist & SEO Copywriter for high-retention long-form educational videos (like Veritasium, Kurzgesagt, and Kok Bisa) in Bahasa Indonesia.

Details:
- Video Context / Narration: ${narrationContext || description || title || "Edukasi sains"}
- Current Title: "${title || "Unknown"}"
- Channel Name: "${channelName || "Sains 60 Detik"}"
- Language: Bahasa Indonesia${customNote}

Your task: Generate an exceptional, viral YouTube Long-Form video metadata package. ALL output MUST be in Bahasa Indonesia.

Generate:
1. **suggestedTitle**: An extremely catchy, clickbait YouTube title that is highly relevant to the specific content. DO NOT include ANY hashtags in the title. The suggestedTitle length MUST be strictly under 95 characters. Use power words, emojis, curiosity gaps, and counter-intuitive facts (mitos vs fakta) to make people STOP scrolling. DO NOT put numbers at the beginning of the title.
2. **suggestedDescription**: An extremely comprehensive, SEO-optimized, and highly engaging caption (up to 4500 characters). Follow this exact storytelling structure:
   - Paragraph 1: An immersive, vivid hook / imagination opener with emojis to immediately grab curiosity.
   - Paragraph 2-3: Deep dive story context, the tension, and the surprising scientific revelation/evidence explained with clear, engaging prose and emojis.
   - Paragraph 4: Takeaway / mind-opening reflection on why this matters to our daily lives.
   - Paragraph 5 (Interaction): An engaging question to spark debate/discussion in the comment section (e.g. "Menurut kamu... ? Tulis di kolom komentar ya! 🤔👇").
   - Paragraph 6 (CTA): A high-conversion call-to-action (e.g. "Jangan lupa LIKE, SHARE, dan SUBSCRIBE untuk fakta sains unik dan mencengangkan lainnya setiap hari! 🔔✨").
   - Paragraph 7 (Source): Exactly "Source : ${channelName}"
   DO NOT append the hashtags block inside suggestedDescription (hashtags will be joined automatically).
3. **hashtags**: Array of AS MANY strategic hashtags as possible based on the video content and SEO keywords (25-35 tags). DO NOT include hashtags for the speaker's name or channel name. Mix with mega-viral tags (#fyp #viral #foryou #foryoupage #trending) and hyper-niche specific science/educational tags. All lowercase with # prefix. DO NOT include #Shorts for Long-Form.

Respond ONLY with valid JSON, no markdown, no code blocks:
{"suggestedTitle":"...","suggestedDescription":"...","hashtags":["#tag1","#tag2"]}`;
  } else {
    // ── SHORTS: Mirroring Clipper AI's exact prompt & viral formula ──
    prompt = `You are a viral content strategist for TikTok, Reels, and YouTube Shorts.

I have a single video clip with the following details:
- Clip Summary / Narration: ${narrationContext || description || title || "Edukasi sains"}
- Current Title: "${title || "Unknown"}"
- Channel/Speaker Name: "${channelName || "Sains 60 Detik"}"
- Language: Bahasa Indonesia${customNote}

Your task: Generate a BETTER, viral caption for this clip. ALL output MUST be in Bahasa Indonesia.

Generate:
1. **suggestedTitle**: An extremely catchy, clickbait TikTok/Reels title that is highly relevant to the specific content. DO NOT include ANY hashtags in the title. The suggestedTitle length MUST be strictly under 100 characters. Use power words, emojis, controversy, SEO keywords, and curiosity gaps to make people STOP scrolling. DO NOT put numbers at the beginning of the title.
2. **suggestedDescription**: An extremely comprehensive, SEO-optimized, and highly engaging caption. Make it as long and detailed as possible, up to a maximum of 4000 characters. Follow this exact viral storytelling structure:
   - Paragraph 1: An immersive, vivid hook / imagination opener with emojis to immediately hook viewers.
   - Paragraph 2: Story context, tension, and the shocking factual twist or scientific revelation explained with emojis.
   - Paragraph 3: Reflection on human behavior / modern life context.
   - Paragraph 4 (Interaction): A provocative question to ignite passionate comments and debate (e.g. "Menurut kamu... ? Tulis di kolom komentar ya! 🤔👇").
   - Paragraph 5 (CTA): Strong CTA (e.g. "Jangan lupa LIKE, SHARE, dan SUBSCRIBE untuk fakta sains unik dan mencengangkan lainnya setiap hari! 🔔✨").
   - Paragraph 6 (Source): Exactly "Source : ${channelName}"
   DO NOT append the hashtags block inside suggestedDescription (hashtags will be appended automatically).
3. **hashtags**: Array of AS MANY strategic hashtags as possible based on the video content and SEO keywords. Do not limit to 30; generate a massive list (25-35 tags). DO NOT include hashtags for the speaker's name or channel name. Mix with mega-viral tags (#fyp #viral #foryou #foryoupage #trending #Shorts) and hyper-niche specific tags. All lowercase with # prefix.

Respond ONLY with valid JSON, no markdown, no code blocks:
{"suggestedTitle":"...","suggestedDescription":"...","hashtags":["#tag1","#tag2"]}`;
  }

  const { parsed, provider: usedProvider } = await generateJson(
    prompt,
    "You are an expert viral Indonesian YouTube copywriter & SEO strategist. Output ONLY valid JSON.",
    { provider }
  );

  const baseTitle = parsed.suggestedTitle || parsed.title || title;
  const rawDesc = parsed.suggestedDescription || parsed.description || description;
  const { hashtags, tags: sortedTags } = formatHashtagsAndTags(parsed.hashtags, parsed.tags || tags);

  // 1. Title format: gabungkan Judul + #Tags strictly <= 100 chars (persis Clipper AI)
  const finalTitle = combineTitleWithHashtags(baseTitle, hashtags, 100, !isLong);

  // 2. Description format: Storytelling + Source + Block Hashtags di bagian bawah
  let finalDesc = String(rawDesc || "").trim();
  if (!finalDesc.includes("Source :")) {
    finalDesc += `\n\nSource : ${channelName}`;
  }
  if (hashtags.length > 0 && !finalDesc.includes(hashtags[0])) {
    finalDesc += `\n\n${hashtags.join(" ")}`;
  }

  return {
    parsed: {
      title: finalTitle,
      description: finalDesc,
      tags: sortedTags,
      hashtags,
      suggestedTitle: baseTitle,
      suggestedDescription: rawDesc,
    },
    provider: usedProvider,
  };
}
