# Sains 60 Detik — Full-AI Video Production Studio

Code-driven video studio untuk channel **Sains 60 Detik** di **YouTube (Long-Form 16:9 & Shorts 9:16)** serta **Facebook Pro Reels (9:16)**, terinspirasi gaya *3D Educational Explainer* (*Elevenbyte*).

## Arsitektur Singkat
1. **Single Source of Truth (`episode.json`)**: Satu naskah modular menghasilkan **1 video Long-Form (16:9)** dan **2–3 klip Short/Reel (9:16)** secara otomatis.
2. **Google Flow (Google AI Pro)**: Hanya untuk *hero 3D clips* (30%) dan *high-res 3D stills* (50%) — lihat [prompts/google_flow_style_guide.md](prompts/google_flow_style_guide.md).
3. **HyperFrames Engine (`engine/`)**: Merakit klip/gambar Google Flow + *Chapter Header*, *Pill Badges*, *Callout Pointers*, *Microscope Frame*, *Procedural Charts*, dan *Karaoke Word-Highlight Subtitles* tanpa editor manual.

## Quick Start
```bash
# 1. Install HyperFrames (sekali di awal)
npm install

# 2. Compile episode demo -> 16:9 Long & 9:16 Short HTML
npm run build:demo

# 3. Preview interaktif di browser
npm run preview:demo

# 4. Render 1-klik (Long 16:9 + semua Short 9:16)
bash scripts/render_episode.sh episodes/ep00_demo_thermal_myth
```

## Generate Natural Indonesian VO + Word Timestamps
```bash
export ELEVENLABS_API_KEY="your_key_here"
python3 scripts/tts_generate.py episodes/ep00_demo_thermal_myth --provider elevenlabs
```
