# Google Flow Master Prompt Guide — Sains 60 Detik (3D Explainer Style)

Gunakan panduan ini untuk menjaga konsistensi visual bergaya *3D Educational Motion Graphics* sekaligus menghemat kuota **Google AI Pro (1.000 kredit/bulan + 50 kredit/hari)**.

## Aturan Emas (Wajib di Setiap Prompt)
1. **ZERO TEXT:** Selalu akhiri prompt dengan:
   `no text, no labels, no subtitles, no UI, no watermark, clean centered composition`
2. **CENTER-SAFE FRAMING (Untuk Reuse 16:9 → 9:16):**
   Pastikan objek utama berada di tengah frame dengan ruang kosong di kiri & kanan agar aman saat di-crop ke 9:16:
   `centered subject in middle third of frame, generous negative space on left and right`
3. **Alokasi Kredit "30 / 50 / 20":**
   - **30% Veo Fast Hero Clips (6–8 klip/episode):** Hanya untuk aksi fisika (panas, cairan, mekanisme bergerak, transisi cutaway).
   - **50% High-Res 3D Stills:** Generate gambar diam lalu animasikan *push-in / pull-out / specular sweep* di HyperFrames (0 kredit Veo).
   - **20% Procedural Cards:** Grafik persentase, perbandingan angka, dan diagram di HyperFrames (0 kredit Flow).

---

## Template Prompt 1: Macro Studio Object (Pembuka / Mitos)
> Clean 3D educational motion graphics render in Cinema4D and Octane style, studio softbox lighting on a bright matte neutral light-grey gradient background. [OBJEK UTAMA, misal: A sleek isometric matte-black motherboard with a brushed metallic CPU and copper heat-pipe cooler hovering slightly above it]. Crisp geometric edges, realistic brushed metal and matte plastic textures, subtle soft contact shadows. Slow smooth dolly push-in camera movement. Centered subject in middle third of frame, generous negative space on left and right, no text, no labels, no watermark, 4k photorealistic 3D explainer.

## Template Prompt 2: Microscopic / Cutaway View (Bukti Sains)
> Clean 3D scientific cross-section cutaway render on a deep dark navy background (#0F172A). Extreme microscopic zoom showing [MEKANISME MIKROSKOPIS, misal: glossy silver metallic terrain with sharp microscopic peaks and deep valleys beneath a descending brushed-copper surface, leaving dark trapped air pockets glowing faintly red with heat]. High-contrast rim lighting, crisp educational tech explainer aesthetic, smooth slow camera glide. Centered composition, no text, no labels, no numbers, no watermark.

## Template Prompt 3: Frames-to-Video Transition (Makro → Mikro)
- **Start Frame:** Upload gambar hasil Template 1 (objek makro).
- **End Frame:** Upload gambar hasil Template 2 (tampilan mikroskopis/cutaway).
- **Prompt Veo:**
  > Seamless continuous macro-to-microscopic camera zoom diving smoothly into the metallic surface, transitioning from bright studio lighting into a deep dark navy scientific cross-section reveal, fluid cinematic motion, no text, no watermark.

---

## Three-Gate Checklist (Hemat Kredit Google AI Pro)
- [ ] **Gate 1 (Script & Fact-Check):** Semua angka/fakta di `episode.json` sudah terverifikasi dan setiap modul punya mini-hook sendiri.
- [ ] **Gate 2 (Still Keyframes):** Semua gambar 3D statis (`assets/stills/*.png`) sudah seragam lighting & komposisinya di tengah frame sebelum memanggil Veo.
- [ ] **Gate 3 (HyperFrames Build & QA):** Jalankan `npm run build:episode <folder>`, cek preview 16:9 & 9:16 untuk memastikan *pill badges*, *callout*, dan *karaoke subtitle* tidak bertabrakan sebelum render final.
