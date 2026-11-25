# Viral Video Hook & Intro Plan — `ep01_mitos_charging_hp` (Sains 60 Detik)

> **Catatan Resource Gratis:** Seluruh rencana intro di bawah ini dirancang agar bisa dieksekusi dengan **biaya Rp0** — memanfaatkan aset lokal yang sudah ada (`assets/clips/*`, `assets/stills/*`, `audio/bgm.mp3`) + procedural HTML5/CSS/SVG/GSAP motion graphics & Web Audio API SFX gratis.

---

## A. CONTENT ANALYSIS

- **Topik Utama:** 3 mitos charging HP paling populer (cas semalaman, main HP sambil dicas, dan kuras baterai sampai 0%) yang dibedah dari sisi kimia & kelistrikan baterai lithium-ion.
- **Momen Paling Menarik / Mengejutkan:**
  1. Di atas suhu **40°C**, elektrolit baterai diam-diam membentuk kerak mikroskopis bernama **lapisan SEI** yang mengunci ion litium secara permanen.
  2. Kebiasaan menguras baterai sampai **0%** sebenarnya aturan baterai jadul tahun 90-an (NiCd) — pada HP modern, kebiasaan itu justru menghancurkan struktur anoda (*deep discharge stress*).
  3. Cas semalaman tidak bikin "overcharge meledak" karena ada chip **PMIC**, tapi menahan tegangan di **4,2 volt** berjam-jam + panas kasur tetap mempercepat penuaan kimia.
- **Curiosity Trigger Terkuat:** Kontras bahwa kebiasaan "merawat HP" yang dilakukan jutaan orang setiap hari justru diam-diam menciptakan kerak permanen dan memperpendek umur baterai — tapi penyebab aslinya **bukan** seperti yang selama ini diceritakan orang.
- **Strategi Hook Rekomendasi:** **Counterintuitive Revelation + Fear & Consequence** (Long-Form 18 detik) dan **Shocking Pattern Interrupt** (Short-Form 5 detik).

---

## B. HOOK VARIATIONS (5 Variasi)

### 1. Maximum Curiosity
- **Narasi Pembuka:** *"Setiap malam kamu mungkin melakukan satu kebiasaan ini ke HP-mu... dan diam-diam, sesuatu sedang tumbuh permanen di dalam baterainya."*
- **On-Screen Text:** `SESUATU TUMBUH DI DALAM BATERAIMU`
- **Visual (Gratis):** Cut cepat ke klip `04_sei_layer_growth.mp4` (zoom mikroskopis) + overlay scanner merah procedural.
- **Estimasi Durasi:** 5,5 detik.

### 2. Shocking / Provocative
- **Narasi Pembuka:** *"Berhenti menguras baterai HP sampai nol persen! Aturan itu dari tahun sembilan puluhan — dan hari ini justru jadi pembunuh senyap HP-mu."*
- **On-Screen Text:** `STOP KURAS KE 0%!` / `ATURAN TAHUN 90-AN`
- **Visual (Gratis):** Animasi procedural ikon baterai turun `100% → 0%` dengan flash merah + glitch, lalu cut ke `05_zero_percent_battery.png`.
- **Estimasi Durasi:** 6 detik.

### 3. Mystery / Suspense
- **Narasi Pembuka:** *"HP-mu sudah seratus persen, chip pintarnya sudah memutus arus... lalu kenapa baterainya tetap menua lebih cepat saat kamu tidur?"*
- **On-Screen Text:** `100% — ARUS PUTUS, TAPI KENAPA TETAP RUSAK?`
- **Visual (Gratis):** `02_overnight_charging_phone.png` gelap dengan indikator `4.2V PEAK` berkedip + `03_high_voltage_cathode_stress.png`.
- **Estimasi Durasi:** 6 detik.

### 4. Controversial / Thought-Provoking
- **Narasi Pembuka:** *"Main HP sambil dicas bikin arus listrik bentrok? Salah besar. Yang benar-benar merusak bateraimu bahkan tidak ada hubungannya dengan arus bentrok."*
- **On-Screen Text:** `ARUS BENTROK? SALAH BESAR.`
- **Visual (Gratis):** Teks besar merah dicoret (`ARUS BENTROK ❌`) + meteran suhu procedural naik cepat melewati `40°C`.
- **Estimasi Durasi:** 6 detik.

### 5. Emotional / Dramatic
- **Narasi Pembuka:** *"Baterai HP yang baru setahun sudah drop bukan karena kamu kurang beruntung... tapi karena tiga aturan charging yang selama ini kamu kira benar."*
- **On-Screen Text:** `BUKAN KURANG BERUNTUNG.` / `3 ATURAN YANG SALAH TOTAL`
- **Visual (Gratis):** Grafik procedural Battery Health anjlok `100% → 78%` + montase cepat 3 still lokal (`02`, `04`, `05`).
- **Estimasi Durasi:** 6,5 detik.

---

## C. BEST RECOMMENDED INTRO

### 1) Versi LONG-FORM (16:9 YouTube — 18 Detik)
Menggabungkan **Counterintuitive Revelation + Mystery + Stakes** (tanpa membocorkan jawaban lengkap dari 3 mitosnya).

- **Narasi / Voice-Over:**
  > *"Kalau kamu masih percaya cas semalaman bikin baterai meledak... atau wajib dikuras sampai nol persen... kamu sedang merusak HP-mu dengan cara yang bahkan tidak kamu sadari.*
  > *Di dalam baterai ini, ada kerak mikroskopis yang bisa mengunci daya secara permanen — hanya karena satu pemicu yang sering kita abaikan setiap hari.*
  > *Bukan arus listrik yang bentrok. Bukan juga overcharge.*
  > *Jadi, apa sebenarnya pembunuh asli baterai HP-mu? Mari kita bedah isi lithium-ion sampai level mikroskopis."*
- **On-Screen Text:**
  - `00:00–00:04`: `CAS SEMALAMAN? KURAS KE 0%?` → `SALAH TOTAL.`
  - `00:04–00:09`: `KERAK MIKROSKOPIS` + HUD `> 40°C` & `4.2V STRESS`
  - `00:09–00:13`: `BUKAN OVERCHARGE.` / `BUKAN ARUS BENTROK.`
  - `00:13–00:18`: `PEMBUNUH ASLI BATERAI HP` → Badge `SAINS 60 DETIK`
- **Visual Direction (100% Gratis):**
  - Gunakan procedural HUD (waveform, meteran suhu `40°C`, persentase baterai anjlok, garis scan mikroskop) di atas footage lokal yang sudah ada (`04_sei_layer_growth.mp4`, `03_high_voltage_cathode_stress.png`, `01_phone_to_battery_cutaway.mp4`).
- **Editing Instructions:**
  - Fast cut tiap 2–3 detik di 10 detik pertama (pattern interrupt), kamera zoom-in lembut (*push-in*), *chromatic flash* singkat saat transisi angka `40°C` dan `0%`.
- **Sound Effects / Music Direction (Gratis):**
  - `00:00`: Low sub-bass hit + glitch tick (Web Audio API synth / freesound CC0).
  - `00:04–00:12`: Tension riser + detak pulse halus di atas `audio/bgm.mp3` volume rendah.
  - `00:13`: Sudden silence 0,3 detik (drop tension) → whoosh masuk ke logo/transisi `SAINS 60 DETIK`.
- **Transition ke Main Content:**
  - Zoom masuk menembus layar HP (`01_phone_to_battery_cutaway.mp4`) langsung menyambung mulus ke **Mitos #1: Ngecas Semalaman**.

### 2) Versi SHORT-FORM (9:16 Shorts / Reels — 5 Detik)
- **Narasi / VO:** *"Berhenti kuras baterai sampai nol persen! Itu aturan baterai tahun sembilan puluhan — dan di HP modern, kebiasaan ini justru menghancurkan bateraimu pelan-pelan."*
- **On-Screen Text:** `STOP KURAS KE 0%!` → `ATURAN TAHUN 90-AN`
- **Visual:** Baterai procedural turun ke `0%` bergetar merah → zoom langsung ke `05_anode_deep_discharge.mp4`.

---

## D. EDITING TIMELINE (Long-Form Intro — 18 Detik)

| Timestamp | Narasi | Visual Footage (Gratis) | Text Overlay | Sound Effect | Teknik Editing |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **00:00 – 00:04.5** | *"Kalau kamu masih percaya cas semalaman bikin baterai meledak, atau wajib dikuras sampai nol persen..."* | Split-flash procedural: Ikon baterai `100%` berkedip + `0%` merah + latar gelap `#0F172A` | `CAS SEMALAMAN?` / `KURAS KE 0%?` | Sub-bass impact + digital glitch | Pattern interrupt, hard cut cepat + micro camera shake |
| **00:04.5 – 00:08.5** | *"...kamu sedang merusak HP-mu dengan cara yang bahkan tidak kamu sadari."* | `03_high_voltage_cathode_stress.png` (push-in lambat) + HUD tegangan `4.2V` | `RUSAK TANPA DISADARI` | Heartbeat pulse halus | Slow push-in + red vignette pulse |
| **00:08.5 – 00:13.0** | *"Di dalam baterai ini, ada kerak mikroskopis yang mengunci daya secara permanen — bukan karena overcharge, bukan juga arus bentrok."* | `04_sei_layer_growth.mp4` (zoom mikroskop) + meteran suhu procedural naik ke `42°C` | `KERAK MIKROSKOPIS` + `BUKAN OVERCHARGE ❌` | Tension riser + thermal beep | Cross-dissolve cepat + kinetic strike-through |
| **00:13.0 – 00:18.0** | *"Jadi, apa sebenarnya pembunuh asli baterai HP-mu? Mari kita bedah isi lithium-ion sampai level mikroskopis."* | `01_phone_to_battery_cutaway.mp4` + viewfinder mikroskop + watermark `SAINS 60 DETIK` | `PEMBUNUH ASLI BATERAI HP` / `SAINS 60 DETIK` | 0.3s silence drop → cinematic whoosh | Open-loop pause → zoom dive transition ke Mitos #1 |

---

## E. ALTERNATIVE OPENING (Pendekatan "Investigasi Malam Hari")

Jika ingin nuansa yang lebih *storytelling* dan sinematik (ala dokumenter sains):

- **Narasi (16 detik):**
  > *"Jam dua pagi. Kamu tidur pulas, sementara HP di sebelah bantalmu sudah seratus persen sejak dua jam lalu.*
  > *Banyak orang bilang HP itu bakal overcharge. Faktanya, chip di dalamnya sudah memutus arus utama.*
  > *Tapi kenapa kesehatan baterainya tetap anjlok dalam setahun? Jawabannya ada di sesuatu yang tidak terlihat mata — dan hampir semua pemilik HP masih salah mengerti tiga aturan dasarnya."*
- **Visual (Gratis):** `02_overnight_charging_phone.png` dengan overlay jam digital procedural `02:00 AM` → cut ke `02_pmic_chip_cutoff.mp4` → grafis `Battery Health 100% → 82%` → masuk ke Mitos #1.
