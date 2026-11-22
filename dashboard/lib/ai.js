import path from "node:path";
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

  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini returned empty response");
  return { parsed: parseJsonResponse(text), provider: `gemini:${model}` };
}

async function callGroq(prompt, systemPrompt) {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) throw new Error("GROQ_API_KEY not configured");

  const model = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
  const messages = [];
  if (systemPrompt) messages.push({ role: "system", content: systemPrompt });
  messages.push({ role: "user", content: prompt });

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

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Groq HTTP ${res.status}: ${errText.slice(0, 200)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error("Groq returned empty response");
  return { parsed: parseJsonResponse(text), provider: `groq:${model}` };
}

/**
 * Gemini primary + automatic fallback to Groq.
 */
export async function generateJson(prompt, systemPrompt = "") {
  const errors = [];
  try {
    return await callGemini(prompt, systemPrompt);
  } catch (e) {
    errors.push(e.message);
  }

  try {
    return await callGroq(prompt, systemPrompt);
  } catch (e) {
    errors.push(e.message);
  }

  throw new Error(
    `Semua AI provider gagal (${errors.join(" | ")}). Pastikan GEMINI_API_KEY atau GROQ_API_KEY sudah diisi di ai-vid-gen/.env`
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

export async function polishVideoMetadata({
  kind = "short",
  title,
  description,
  tags = [],
  narrationContext = "",
  instruction = "",
  channelName = "Sains 60 Detik",
}) {
  const isLong = kind === "long";
  const customNote = instruction ? `\nInstruksi revisi khusus dari user: "${instruction}"` : "";

  const prompt = isLong
    ? `Kamu adalah YouTube Strategist & SEO specialist untuk channel edukasi sains Bahasa Indonesia "${channelName}".
Revisi & polish metadata untuk VIDEO LONG-FORM (16:9) berikut agar CTR tinggi, jelas, dan SEO-friendly.

Data saat ini:
- Title: ${title}
- Description: ${description}
- Tags: ${Array.isArray(tags) ? tags.join(", ") : tags}
- Konteks isi video: ${narrationContext}${customNote}

Aturan:
1. title: menarik, high-CTR, Bahasa Indonesia, TANPA hashtag, maksimal 95 karakter.
2. description: informatif, hook kuat di 2 baris pertama, pertahankan bagian Chapters (timestamp 00:00 ...) jika sudah ada di deskripsi sebelumnya, tambahkan CTA komentar, dan akhiri dengan 4-6 hashtag relevan (JANGAN masukkan #Shorts). Maksimal 4500 karakter.
3. tags: array 10-18 keyword SEO YouTube Bahasa Indonesia tanpa tanda #.

Balas HANYA dengan JSON valid:
{"title":"...","description":"...","tags":["tag1","tag2"]}`
    : `Kamu adalah viral content strategist YouTube Shorts untuk channel edukasi sains Bahasa Indonesia "${channelName}".
Revisi & polish metadata untuk YOUTUBE SHORT (9:16) berikut agar bikin penonton berhenti scroll dan lanjut nonton video lengkapnya.

Data saat ini:
- Title: ${title}
- Description: ${description}
- Tags: ${Array.isArray(tags) ? tags.join(", ") : tags}
- Konteks isi Short: ${narrationContext}${customNote}

Aturan:
1. title: punchy, bikin penasaran, Bahasa Indonesia, TANPA hashtag, maksimal 90 karakter.
2. description: ringkas tapi menarik, pertahankan link YouTube video lengkap jika sudah ada di deskripsi sebelumnya, tambahkan CTA singkat, dan akhiri dengan hashtag yang WAJIB menyertakan #Shorts + #Sains60Detik + 4-6 hashtag niche.
3. tags: array 10-15 keyword SEO tanpa tanda # (wajib sertakan "Shorts").

Balas HANYA dengan JSON valid:
{"title":"...","description":"...","tags":["Shorts","tag2"]}`;

  return generateJson(prompt, "Respon hanya JSON valid tanpa markdown.");
}
