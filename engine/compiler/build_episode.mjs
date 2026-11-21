#!/usr/bin/env node
/**
 * Proof & Myth — HyperFrames Episode Compiler
 * Reads episodes/<ep>/episode.json (+ optional audio/words.json)
 * Outputs:
 *   - build/brand.css            (local copy so asset paths stay inside project root)
 *   - build/long_16x9.html       (1920x1080 YouTube Long-Form)
 *   - build/short_<id>_9x16.html (1080x1920 YouTube Shorts & Facebook Pro Reels)
 */

import fs from "node:fs";
import path from "node:path";

const episodeDir = process.argv[2];
if (!episodeDir) {
  console.error("Usage: node engine/compiler/build_episode.mjs <episode-dir>");
  process.exit(1);
}

const absEpDir = path.resolve(episodeDir);
const epJsonPath = path.join(absEpDir, "episode.json");
if (!fs.existsSync(epJsonPath)) {
  console.error(`episode.json not found at: ${epJsonPath}`);
  process.exit(1);
}

const episode = JSON.parse(fs.readFileSync(epJsonPath, "utf8"));
const buildDir = path.join(absEpDir, "build");
const outputDir = path.join(absEpDir, "output");
fs.mkdirSync(buildDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

// Copy brand.css locally inside buildDir & link assets/audio so paths never use "../"
fs.copyFileSync(path.resolve("engine/styles/brand.css"), path.join(buildDir, "brand.css"));
for (const folder of ["assets", "audio"]) {
  const target = path.join(absEpDir, folder);
  const linkPath = path.join(buildDir, folder);
  if (fs.existsSync(target) && !fs.existsSync(linkPath)) {
    try {
      fs.symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    } catch {
      fs.cpSync(target, linkPath, { recursive: true });
    }
  }
}

const wordsJsonPath = path.join(absEpDir, "audio", "words.json");
const realWords = fs.existsSync(wordsJsonPath)
  ? JSON.parse(fs.readFileSync(wordsJsonPath, "utf8"))
  : null;

function esc(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function fmtSec(n) {
  return Number(n).toFixed(3);
}

function computeTimeline(segments) {
  let cursor = 0;
  return segments.map((seg) => {
    const segStart = cursor;
    const beats = (seg.beats || []).map((beat) => {
      const start = cursor;
      const duration = Number(beat.duration || 4);
      cursor += duration;
      return { ...beat, absStart: start, absEnd: cursor, duration };
    });
    return { ...seg, absStart: segStart, absEnd: cursor, duration: cursor - segStart, beats };
  });
}

function buildEstimatedWords(beats) {
  const words = [];
  for (const beat of beats) {
    if (!beat.narration) continue;
    const tokens = beat.narration.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const pad = 0.12;
    const usable = Math.max(0.4, beat.duration - pad * 2);
    const step = usable / tokens.length;
    tokens.forEach((w, i) => {
      const start = beat.absStart + pad + i * step;
      const end = start + step;
      words.push({ word: w, start: Number(start.toFixed(3)), end: Number(end.toFixed(3)) });
    });
  }
  return words;
}

function buildKaraokePhrases(words, offsetStart, windowEnd, maxWordsPerPhrase = 5) {
  const filtered = words
    .filter((w) => w.end > offsetStart && w.start < windowEnd)
    .map((w) => ({
      word: w.word,
      start: Number(Math.max(0, w.start - offsetStart).toFixed(3)),
      end: Number(Math.min(windowEnd - offsetStart, w.end - offsetStart).toFixed(3)),
    }))
    .filter((w) => w.end - w.start > 0.02);

  const phrases = [];
  for (let i = 0; i < filtered.length; i += maxWordsPerPhrase) {
    const slice = filtered.slice(i, i + maxWordsPerPhrase);
    phrases.push({
      start: slice[0].start,
      end: slice[slice.length - 1].end,
      words: slice,
    });
  }
  return phrases;
}

function renderProceduralVisual(proc, format) {
  if (!proc) return "";
  if (proc.type === "stat_bars") {
    const rows = (proc.items || [])
      .map(
        (item) => `
          <div class="stat-row">
            <div class="stat-header">
              <span>${esc(item.label)}</span>
              <span style="color:${esc(item.color || "#facc15")}">${esc(item.valueText)}</span>
            </div>
            <div class="stat-bar-track">
              <div class="stat-bar-fill" style="width:${Number(item.percent || 50)}%;background:${esc(item.color || "#facc15")};"></div>
            </div>
          </div>`
      )
      .join("");
    return `<div class="procedural-card">${rows}</div>`;
  }
  if (proc.type === "microscopic_surface") {
    const vb = format === "9:16" ? "0 0 1080 1920" : "0 0 1920 1080";
    const midY = format === "9:16" ? 960 : 540;
    const w = format === "9:16" ? 1080 : 1920;
    return `
      <svg viewBox="${vb}" width="100%" height="100%" preserveAspectRatio="xMidYMid slice" style="position:absolute;inset:0;">
        <defs>
          <linearGradient id="copperGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#f59e0b"/>
            <stop offset="100%" stop-color="#b45309"/>
          </linearGradient>
          <linearGradient id="nickelGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#e2e8f0"/>
            <stop offset="100%" stop-color="#64748b"/>
          </linearGradient>
        </defs>
        <path d="M0 0 H${w} V${midY - 95} Q${w * 0.25} ${midY - 60} ${w * 0.5} ${midY - 90} T${w} ${midY - 75} V0 Z" fill="url(#copperGrad)" opacity="0.92"/>
        <rect x="0" y="${midY - 95}" width="${w}" height="190" fill="#ef4444" opacity="0.16"/>
        <path d="M0 ${midY + 60} L${w * 0.14} ${midY - 75} L${w * 0.26} ${midY + 85} L${w * 0.42} ${midY - 78} L${w * 0.58} ${midY + 95} L${w * 0.74} ${midY - 72} L${w * 0.88} ${midY + 75} L${w} ${midY - 40} V${midY * 2} H0 Z" fill="url(#nickelGrad)"/>
      </svg>`;
  }
  return "";
}

function renderBeat(beat, idx, relStart, format) {
  const dur = beat.duration;
  const wantsVideo = beat.visual?.kind === "veo_video" && Boolean(beat.visual.src);
  const videoExists = wantsVideo && fs.existsSync(path.join(absEpDir, beat.visual.src));
  const isVideo = wantsVideo && videoExists;
  const themeCls = isVideo ? "" : (beat.theme === "studio" ? "theme-studio" : "theme-cutaway");
  const headerTone = beat.theme === "studio" ? "on-light" : "on-dark";
  const motionCls = beat.motion ? `motion-${beat.motion}` : "motion-push-in";

  let videoElement = "";
  let visualHtml = "";
  if (isVideo) {
    videoElement = `<video id="video-${idx}" class="clip" src="${esc(beat.visual.src)}" data-start="${fmtSec(relStart)}" data-duration="${fmtSec(dur)}" data-track-index="1" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:2;" muted></video>`;
  } else if (wantsVideo && !videoExists) {
    visualHtml = `
      <div class="pending-clip-card">
        <span class="pending-clip-badge">GATE 2B — KLIP VIDEO BELUM DI-GENERATE</span>
        <div class="pending-clip-file">${esc(beat.visual.src)}</div>
        <div class="pending-clip-hint">Generate klip ini di Gate 2B agar visual 3D animasi muncul di scene ini</div>
      </div>`;
  } else if (beat.visual?.kind === "still_3d" && beat.visual.src) {
    visualHtml = `<div class="media-frame"><img src="${esc(beat.visual.src)}" class="${motionCls}" style="--clip-dur:${fmtSec(dur)}s" alt="" /></div>`;
  } else if (beat.visual?.kind === "procedural") {
    visualHtml = renderProceduralVisual(beat.visual.procedural, format);
  }

  const specularHtml = beat.specularSweep ? `<div class="specular-overlay"></div>` : "";

  const microscopeHtml = beat.microscope
    ? `<div class="microscope-frame">
         <div class="microscope-corner tl"></div>
         <div class="microscope-corner tr"></div>
         <div class="microscope-corner bl"></div>
         <div class="microscope-corner br"></div>
       </div>`
    : "";

  const chapterHtml = beat.chapter
    ? `<div class="chapter-header ${headerTone}">
         <div class="chapter-line-1">${esc(beat.chapter.line1)}</div>
         <div class="chapter-line-2 accent-${esc(beat.chapter.accent || "yellow")}">${esc(beat.chapter.line2)}</div>
       </div>`
    : "";

  const badgesHtml = (beat.badges || [])
    .map((b) => {
      const pos = format === "9:16" && b.pos9x16 ? b.pos9x16 : b.pos || { x: 50, y: 50 };
      return `<div class="pill-badge pill-${esc(b.variant || "fact")}" style="left:${pos.x}%;top:${pos.y}%;">${esc(b.text)}</div>`;
    })
    .join("\n        ");

  const callouts = beat.callouts || [];
  let calloutSvg = "";
  if (callouts.length) {
    const W = format === "9:16" ? 1080 : 1920;
    const H = format === "9:16" ? 1920 : 1080;
    const lines = callouts
      .map((c) => {
        const from = format === "9:16" && c.from9x16 ? c.from9x16 : c.from;
        const to = format === "9:16" && c.to9x16 ? c.to9x16 : c.to;
        const x1 = (from.x / 100) * W;
        const y1 = (from.y / 100) * H;
        const x2 = (to.x / 100) * W;
        const y2 = (to.y / 100) * H;
        return `
          <line class="callout-line" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${esc(c.color || "#facc15")}" stroke-width="4" stroke-linecap="round" />
          <circle cx="${x2}" cy="${y2}" r="9" fill="${esc(c.color || "#facc15")}" />`;
      })
      .join("");
    calloutSvg = `<svg class="callout-layer" viewBox="0 0 ${W} ${H}" width="100%" height="100%">${lines}</svg>`;
  }

  return `
      ${videoElement}
      <div id="scene-${idx}" class="clip scene-layer ${themeCls}" data-start="${fmtSec(relStart)}" data-duration="${fmtSec(dur)}" data-track-index="0" style="z-index:10;">
        ${visualHtml}
        ${specularHtml}
        ${microscopeHtml}
        ${calloutSvg}
        ${chapterHtml}
        ${badgesHtml}
      </div>`;
}

function buildCompositionHtml({ title, format, width, height, totalDuration, beats, words, offsetStart, watermark, audioSrc, bgmSrc }) {
  const sceneHtml = beats
    .map((b, idx) => renderBeat(b, idx, b.absStart - offsetStart, format))
    .join("\n");

  const phrases = buildKaraokePhrases(words, offsetStart, offsetStart + totalDuration, format === "9:16" ? 4 : 6);

  const audioHtml = audioSrc && fs.existsSync(path.join(absEpDir, audioSrc))
    ? `<audio id="vo-track" class="clip" src="${esc(audioSrc)}" data-start="0" data-duration="${fmtSec(totalDuration)}" data-track-index="8"></audio>`
    : "";

  const bgmHtml = bgmSrc && fs.existsSync(path.join(absEpDir, bgmSrc))
    ? `<audio id="bgm-track" class="clip" src="${esc(bgmSrc)}" data-start="0" data-duration="${fmtSec(totalDuration)}" data-track-index="9"></audio>`
    : "";

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8" />
  <title>${esc(title)} (${format})</title>
  <link rel="stylesheet" href="brand.css" />
</head>
<body>
  <div id="root" class="stage" data-composition-id="root" data-format="${format}" data-start="0" data-duration="${fmtSec(totalDuration)}" data-width="${width}" data-height="${height}">
    ${sceneHtml}
    <div id="karaoke-overlay" class="karaoke-wrap">
      <div id="karaoke-box" class="karaoke-box" style="display:none;"></div>
    </div>
    ${watermark ? `<div id="channel-watermark" class="watermark">${esc(watermark)}</div>` : ""}
    ${audioHtml}
    ${bgmHtml}
  </div>
  <script>
    (function () {
      const TOTAL_DURATION = ${fmtSec(totalDuration)};
      const PHRASES = ${JSON.stringify(phrases)};
      const box = document.getElementById("karaoke-box");
      const wm = document.getElementById("channel-watermark");
      const scenes = Array.from(document.querySelectorAll(".scene-layer")).map((el) => ({
        el,
        isStudio: el.classList.contains("theme-studio"),
        start: parseFloat(el.dataset.start || "0"),
        end: parseFloat(el.dataset.start || "0") + parseFloat(el.dataset.duration || "0"),
      }));

      function renderAt(t) {
        let activeScene = null;
        for (const s of scenes) {
          const visible = t >= s.start && t < s.end;
          s.el.style.display = visible ? "block" : "none";
          if (visible) activeScene = s;
        }
        if (wm) {
          wm.classList.toggle("on-light", Boolean(activeScene && activeScene.isStudio));
        }
        const activePhrase = PHRASES.find((p) => t >= p.start && t <= p.end);
        if (!activePhrase) {
          box.style.display = "none";
          return;
        }
        box.style.display = "inline-flex";
        box.innerHTML = activePhrase.words
          .map((w) => {
            const cls = t >= w.start && t < w.end ? "karaoke-word is-active" : "karaoke-word";
            return '<span class="' + cls + '">' + w.word.replace(/</g, "&lt;") + "</span>";
          })
          .join("");
      }

      const tl = {
        _t: 0,
        _dur: TOTAL_DURATION,
        duration() { return this._dur; },
        totalDuration() { return this._dur; },
        pause() { return this; },
        seek(t) { this._t = t; renderAt(t); return this; },
        time(t) { if (arguments.length === 0) return this._t; return this.seek(t); },
        totalTime(t) { if (arguments.length === 0) return this._t; return this.seek(t); },
        progress(p) { if (arguments.length === 0) return this._dur ? this._t / this._dur : 0; return this.seek(p * this._dur); },
      };

      window.__timelines = window.__timelines || {};
      window.__timelines["root"] = tl;
      renderAt(0);
    })();
  </script>
</body>
</html>
`;
}

const allSegments = [];
if (episode.intro) allSegments.push({ id: "intro", kind: "intro", ...episode.intro });
for (const mod of episode.modules || []) {
  allSegments.push({ kind: "module", ...mod });
}
if (episode.outro) allSegments.push({ id: "outro", kind: "outro", ...episode.outro });

const timedSegments = computeTimeline(allSegments);
const allBeats = timedSegments.flatMap((s) => s.beats);
const totalDuration = timedSegments.length ? timedSegments[timedSegments.length - 1].absEnd : 0;
const words = realWords || buildEstimatedWords(allBeats);

// 1. Long-Form 16:9 Master
const longHtml = buildCompositionHtml({
  title: episode.title || "Proof & Myth Episode",
  format: "16:9",
  width: 1920,
  height: 1080,
  totalDuration,
  beats: allBeats,
  words,
  offsetStart: 0,
  watermark: episode.watermark || "PROOF & MYTH",
  audioSrc: episode.audio?.vo,
  bgmSrc: episode.audio?.bgm,
});
const longOutPath = path.join(buildDir, "long_16x9.html");
fs.writeFileSync(longOutPath, longHtml, "utf8");
fs.writeFileSync(path.join(buildDir, "index.html"), longHtml, "utf8");
console.log(`Built 16:9 Long-Form: ${longOutPath} (${totalDuration.toFixed(1)}s)`);

// 2. Standalone 9:16 Short/Reel per Module
for (const seg of timedSegments.filter((s) => s.kind === "module")) {
  const shortHtml = buildCompositionHtml({
    title: `${episode.title} — ${seg.title || seg.id}`,
    format: "9:16",
    width: 1080,
    height: 1920,
    totalDuration: seg.duration,
    beats: seg.beats,
    words,
    offsetStart: seg.absStart,
    watermark: episode.watermark || "PROOF & MYTH",
    audioSrc: seg.audio_vo || null,
    bgmSrc: episode.audio?.bgm,
  });
  const shortOutPath = path.join(buildDir, `short_${seg.id}_9x16.html`);
  fs.writeFileSync(shortOutPath, shortHtml, "utf8");
  console.log(`Built 9:16 Short/Reel: ${shortOutPath} (${seg.duration.toFixed(1)}s)`);
}
