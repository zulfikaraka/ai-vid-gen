"use client";

import { useState, useMemo } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock,
  ExternalLink,
  Film,
  Sparkles,
  CheckCircle2,
  CalendarClock,
  ArrowRight,
} from "lucide-react";

// Playbook Sains 60 Detik (Bab 9) — index 0 = Minggu, 1 = Senin, ..., 6 = Sabtu (matching Date.getDay())
const WEEKLY_RECOMMENDATIONS = [
  {
    dayIndex: 1,
    dayName: "Senin",
    shortLabel: "Riset / Opsional",
    slotType: "optional",
    youtube: "Tidak wajib upload (riset / komunitas)",
    facebook: "Post edukasi opsional",
    timeWib: "—",
    productionFocus: "Riset topik, topic scoring, pertanyaan utama & angle",
  },
  {
    dayIndex: 2,
    dayName: "Selasa",
    shortLabel: "Short · 18:30",
    slotType: "short",
    youtube: "YouTube Short (excerpt long-form)",
    facebook: "Facebook Reels native",
    timeWib: "18:30 – 19:30 WIB",
    defaultHour: "18:30",
    productionFocus: "Pendalaman riset, source ledger, fact-check, outline/script",
  },
  {
    dayIndex: 3,
    dayName: "Rabu",
    shortLabel: "Short · 18:30",
    slotType: "short",
    youtube: "YouTube Short (excerpt long-form)",
    facebook: "Facebook Reels native",
    timeWib: "18:30 – 19:30 WIB",
    defaultHour: "18:30",
    productionFocus: "Finalisasi naskah, review fakta & storytelling, visual brief",
  },
  {
    dayIndex: 4,
    dayName: "Kamis",
    shortLabel: "LONG · 19:00",
    slotType: "long",
    youtube: "Long-Form Utama (3–5 menit)",
    facebook: "Video / Reels native",
    timeWib: "18:30 – 20:00 WIB",
    defaultHour: "19:00",
    productionFocus: "Final review master video; pilih kandidat clip dari transkrip final",
  },
  {
    dayIndex: 5,
    dayName: "Jumat",
    shortLabel: "Short · 18:30",
    slotType: "short",
    youtube: "YouTube Short (excerpt long-form)",
    facebook: "Facebook Reels native",
    timeWib: "18:30 – 19:30 WIB",
    defaultHour: "18:30",
    productionFocus: "Distribusi clip & monitoring performa awal long-form",
  },
  {
    dayIndex: 6,
    dayName: "Sabtu",
    shortLabel: "Opsional",
    slotType: "optional",
    youtube: "Opsional (long-form kedua hanya jika siap)",
    facebook: "Clip atau post pendukung",
    timeWib: "11:00 / 19:00 WIB (opsional)",
    productionFocus: "Respons komentar & catat pertanyaan audiens untuk ide lanjutan",
  },
  {
    dayIndex: 0,
    dayName: "Minggu",
    shortLabel: "Short · 18:30",
    slotType: "short",
    youtube: "YouTube Short (excerpt long-form)",
    facebook: "Facebook Reels native",
    timeWib: "18:30 – 19:30 WIB",
    defaultHour: "18:30",
    productionFocus: "Evaluasi mingguan & perencanaan topik minggu berikutnya",
  },
];

const REC_BY_DOW = Object.fromEntries(WEEKLY_RECOMMENDATIONS.map((r) => [r.dayIndex, r]));
const MONTH_NAMES_ID = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function toDateKey(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtTimeWib(isoStr) {
  if (!isoStr) return "--:--";
  const d = new Date(isoStr);
  if (Number.isNaN(d.getTime())) return "--:--";
  return d.toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Asia/Jakarta",
  });
}

function fmtFullDateId(dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  const rec = REC_BY_DOW[dt.getDay()];
  return `${rec?.dayName || ""}, ${d} ${MONTH_NAMES_ID[m - 1]} ${y}`;
}

export default function CalendarView({ episodes, onGoVideos }) {
  const today = useMemo(() => new Date(), []);
  const todayKey = toDateKey(today);

  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [selectedKey, setSelectedKey] = useState(todayKey);
  const [filterKind, setFilterKind] = useState("all"); // "all" | "long" | "short"

  // Flatten all uploaded / scheduled deliverables with timestamps
  const { itemsByDate, allScheduledOrUploaded, unscheduledReady } = useMemo(() => {
    const byDate = new Map();
    const list = [];
    const readyNotUploaded = [];

    for (const ep of episodes || []) {
      const deliverables = [ep.deliverables?.long, ...(ep.deliverables?.shorts || [])].filter(Boolean);
      for (const item of deliverables) {
        if (filterKind !== "all" && item.kind !== filterKind) continue;
        if (item.status === "uploaded" || item.status === "scheduled") {
          const iso = item.uploadDate || item.uploadRecord?.publishAt || item.uploadRecord?.uploadedAt;
          if (!iso) continue;
          const dt = new Date(iso);
          if (Number.isNaN(dt.getTime())) continue;
          // Convert to Asia/Jakarta local date key
          const parts = new Intl.DateTimeFormat("en-CA", {
            timeZone: "Asia/Jakarta",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(dt); // YYYY-MM-DD
          const entry = {
            ...item,
            dateKey: parts,
            timeWib: fmtTimeWib(iso),
            isoDate: iso,
            timestamp: dt.getTime(),
          };
          list.push(entry);
          if (!byDate.has(parts)) byDate.set(parts, []);
          byDate.get(parts).push(entry);
        } else if (item.videoFile) {
          readyNotUploaded.push(item);
        }
      }
    }

    for (const arr of byDate.values()) {
      arr.sort((a, b) => a.timestamp - b.timestamp);
    }
    list.sort((a, b) => b.timestamp - a.timestamp);

    return {
      itemsByDate: byDate,
      allScheduledOrUploaded: list,
      unscheduledReady: readyNotUploaded,
    };
  }, [episodes, filterKind]);

  // Build calendar cells (Monday-first grid)
  const cells = useMemo(() => {
    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    // Monday = 0, ..., Sunday = 6
    const startOffset = (firstOfMonth.getDay() + 6) % 7;
    const grid = [];

    for (let i = 0; i < startOffset; i++) {
      const dt = new Date(viewYear, viewMonth, 1 - (startOffset - i));
      grid.push({ date: dt, key: toDateKey(dt), inMonth: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dt = new Date(viewYear, viewMonth, day);
      grid.push({ date: dt, key: toDateKey(dt), inMonth: true });
    }
    while (grid.length % 7 !== 0) {
      const last = grid[grid.length - 1].date;
      const dt = new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1);
      grid.push({ date: dt, key: toDateKey(dt), inMonth: false });
    }
    return grid;
  }, [viewYear, viewMonth]);

  // Month counts
  const monthPrefix = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
  const monthItems = allScheduledOrUploaded.filter((x) => x.dateKey.startsWith(monthPrefix));
  const monthUploadedCount = monthItems.filter((x) => x.status === "uploaded").length;
  const monthScheduledCount = monthItems.filter((x) => x.status === "scheduled").length;

  // Next 5 open recommended upload slots starting from today
  const nextRecommendedSlots = useMemo(() => {
    const slots = [];
    for (let offset = 0; offset < 21 && slots.length < 5; offset++) {
      const dt = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
      const rec = REC_BY_DOW[dt.getDay()];
      if (!rec || rec.slotType === "optional") continue;
      const key = toDateKey(dt);
      const existing = itemsByDate.get(key) || [];
      const alreadyHasKind = existing.some((e) => e.kind === rec.slotType);
      if (!alreadyHasKind) {
        slots.push({
          dateKey: key,
          label: fmtFullDateId(key),
          slotType: rec.slotType,
          timeWib: rec.defaultHour ? `${rec.defaultHour} WIB` : rec.timeWib,
          youtube: rec.youtube,
          facebook: rec.facebook,
        });
      }
    }
    return slots;
  }, [today, itemsByDate]);

  const selectedItems = itemsByDate.get(selectedKey) || [];
  const selectedRec = useMemo(() => {
    const [y, m, d] = selectedKey.split("-").map(Number);
    return REC_BY_DOW[new Date(y, m - 1, d).getDay()];
  }, [selectedKey]);

  function prevMonth() {
    if (viewMonth === 0) {
      setViewYear((y) => y - 1);
      setViewMonth(11);
    } else {
      setViewMonth((m) => m - 1);
    }
  }

  function nextMonth() {
    if (viewMonth === 11) {
      setViewYear((y) => y + 1);
      setViewMonth(0);
    } else {
      setViewMonth((m) => m + 1);
    }
  }

  function goToday() {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedKey(todayKey);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      {/* Header */}
      <div className="space-between" style={{ flexWrap: "wrap", gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, display: "flex", alignItems: "center", gap: 8 }}>
            <CalendarDays size={22} /> Content Calendar
          </h1>
          <div style={{ fontSize: 13, color: "var(--muted)" }}>
            Pantau konten yang sudah terupload &amp; terjadwal beserta jam tayang (WIB), plus rekomendasi jadwal editorial Sains 60 Detik.
          </div>
        </div>

        <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
          <select
            className="input"
            style={{ width: "auto", padding: "6px 10px", fontSize: 12.5 }}
            value={filterKind}
            onChange={(e) => setFilterKind(e.target.value)}
          >
            <option value="all">Semua Format</option>
            <option value="long">Long-Form 16:9</option>
            <option value="short">Shorts 9:16</option>
          </select>
          <button className="btn btn-sm" onClick={goToday}>
            Hari Ini
          </button>
          <button className="btn btn-sm" onClick={prevMonth} title="Bulan sebelumnya">
            <ChevronLeft size={15} />
          </button>
          <div style={{ minWidth: 130, textAlign: "center", fontWeight: 700, fontSize: 14 }}>
            {MONTH_NAMES_ID[viewMonth]} {viewYear}
          </div>
          <button className="btn btn-sm" onClick={nextMonth} title="Bulan berikutnya">
            <ChevronRight size={15} />
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid-3">
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Uploaded ({MONTH_NAMES_ID[viewMonth]})</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--green)", marginTop: 2 }}>{monthUploadedCount}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
            {monthItems.filter((x) => x.status === "uploaded" && x.kind === "long").length} Long ·{" "}
            {monthItems.filter((x) => x.status === "uploaded" && x.kind === "short").length} Shorts
          </div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Scheduled ({MONTH_NAMES_ID[viewMonth]})</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "var(--amber)", marginTop: 2 }}>{monthScheduledCount}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Menunggu jadwal tayang otomatis</div>
        </div>
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Siap Upload (MP4 Ready)</div>
          <div className="space-between" style={{ alignItems: "center", marginTop: 2 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#60a5fa" }}>{unscheduledReady.length}</div>
            {unscheduledReady.length > 0 && onGoVideos && (
              <button className="btn btn-sm btn-primary" onClick={onGoVideos}>
                Upload <ArrowRight size={12} />
              </button>
            )}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Sudah dirender, belum masuk jadwal</div>
        </div>
      </div>

      {/* Monthly Calendar Grid */}
      <div className="card" style={{ padding: 14 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 6,
            marginBottom: 8,
          }}
        >
          {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => (
            <div
              key={d}
              style={{
                textAlign: "center",
                fontSize: 12,
                fontWeight: 700,
                color: d === "Kam" ? "#60a5fa" : "var(--muted)",
                padding: "4px 0",
              }}
            >
              {d}
            </div>
          ))}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, minmax(0, 1fr))",
            gap: 6,
          }}
        >
          {cells.map((cell) => {
            const items = itemsByDate.get(cell.key) || [];
            const rec = REC_BY_DOW[cell.date.getDay()];
            const isToday = cell.key === todayKey;
            const isSelected = cell.key === selectedKey;
            const hasRecFilled = rec && rec.slotType !== "optional" && items.some((it) => it.kind === rec.slotType);

            return (
              <div
                key={cell.key}
                onClick={() => setSelectedKey(cell.key)}
                style={{
                  minHeight: 98,
                  padding: 7,
                  borderRadius: 8,
                  cursor: "pointer",
                  background: isSelected
                    ? "rgba(59, 130, 246, 0.14)"
                    : cell.inMonth
                    ? "var(--surface-2)"
                    : "rgba(15, 23, 42, 0.45)",
                  border: isSelected
                    ? "1px solid var(--accent)"
                    : isToday
                    ? "1px solid rgba(34, 197, 94, 0.65)"
                    : "1px solid var(--border)",
                  opacity: cell.inMonth ? 1 : 0.48,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div className="space-between" style={{ alignItems: "center" }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: isToday ? 800 : 600,
                      color: isToday ? "var(--green)" : "var(--text)",
                    }}
                  >
                    {cell.date.getDate()}
                  </span>
                  {rec && rec.slotType !== "optional" && (
                    <span
                      style={{
                        fontSize: 9.5,
                        padding: "1px 5px",
                        borderRadius: 4,
                        fontWeight: 600,
                        background: hasRecFilled
                          ? "rgba(34, 197, 94, 0.16)"
                          : rec.slotType === "long"
                          ? "rgba(59, 130, 246, 0.15)"
                          : "rgba(148, 163, 184, 0.12)",
                        color: hasRecFilled
                          ? "var(--green)"
                          : rec.slotType === "long"
                          ? "#93c5fd"
                          : "var(--muted)",
                        border: hasRecFilled ? "1px solid rgba(34, 197, 94, 0.3)" : "1px dashed rgba(148, 163, 184, 0.25)",
                      }}
                      title={`Rekomendasi: ${rec.youtube} (${rec.timeWib})`}
                    >
                      {rec.shortLabel}
                    </span>
                  )}
                </div>

                {/* Uploaded / Scheduled entries */}
                <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
                  {items.slice(0, 3).map((it) => (
                    <div
                      key={it.key}
                      style={{
                        fontSize: 10.5,
                        padding: "2px 5px",
                        borderRadius: 4,
                        background:
                          it.status === "scheduled"
                            ? "rgba(245, 158, 11, 0.18)"
                            : it.kind === "long"
                            ? "rgba(59, 130, 246, 0.24)"
                            : "rgba(34, 197, 94, 0.18)",
                        color: "var(--text)",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                      title={`${it.timeWib} WIB · [${it.kind.toUpperCase()}] ${it.metadata?.title || it.episodeTitle}`}
                    >
                      <span style={{ fontWeight: 700, marginRight: 4 }}>{it.timeWib}</span>
                      <span style={{ opacity: 0.85 }}>
                        {it.kind === "long" ? "📺" : "⚡"} {it.metadata?.title || it.moduleTitle || it.episodeTitle}
                      </span>
                    </div>
                  ))}
                  {items.length > 3 && (
                    <div style={{ fontSize: 10, color: "var(--muted)" }}>+{items.length - 3} lainnya</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected Day Details + Next Recommended Slots */}
      <div className="grid-2">
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="space-between" style={{ alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Detail: {fmtFullDateId(selectedKey)}</div>
            <span className="badge badge-slate">{selectedItems.length} konten</span>
          </div>

          {selectedRec && (
            <div className="card-subtle" style={{ fontSize: 12, display: "flex", flexDirection: "column", gap: 4 }}>
              <div style={{ fontWeight: 700, color: "#93c5fd", display: "flex", alignItems: "center", gap: 5 }}>
                <Sparkles size={13} /> Rekomendasi Hari {selectedRec.dayName}
              </div>
              <div>
                <strong>YouTube:</strong> {selectedRec.youtube}
              </div>
              <div>
                <strong>Facebook:</strong> {selectedRec.facebook}
              </div>
              <div>
                <strong>Jam Ideal:</strong> {selectedRec.timeWib}
              </div>
              <div style={{ color: "var(--muted)", marginTop: 2 }}>
                Fokus tim: {selectedRec.productionFocus}
              </div>
            </div>
          )}

          {selectedItems.length === 0 ? (
            <div className="card-subtle" style={{ color: "var(--muted)", fontSize: 12.5 }}>
              Belum ada konten yang diupload atau dijadwalkan pada tanggal ini.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {selectedItems.map((it) => (
                <div key={it.key} className="card-subtle" style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                  <div className="space-between" style={{ alignItems: "center", gap: 8 }}>
                    <div className="row" style={{ gap: 6 }}>
                      <span className={`badge ${it.kind === "long" ? "badge-blue" : "badge-slate"}`}>
                        {it.kind === "long" ? "LONG 16:9" : "SHORT 9:16"}
                      </span>
                      <span className={`badge ${it.status === "scheduled" ? "badge-amber" : "badge-green"}`}>
                        {it.status === "scheduled" ? (
                          <>
                            <CalendarClock size={11} /> Scheduled
                          </>
                        ) : (
                          <>
                            <CheckCircle2 size={11} /> Uploaded
                          </>
                        )}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }}>
                      <Clock size={12} /> {it.timeWib} WIB
                    </span>
                  </div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>
                    {it.metadata?.title || it.moduleTitle || it.episodeTitle}
                  </div>
                  <div className="space-between" style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    <span>
                      {it.episodeId} {it.channelName ? `· ${it.channelName}` : ""}
                    </span>
                    {it.youtubeUrl && (
                      <a href={it.youtubeUrl} target="_blank" rel="noreferrer" style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                        YouTube <ExternalLink size={11} />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Next Open Recommended Slots */}
        <div className="card" style={{ padding: 16, display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="space-between" style={{ alignItems: "center" }}>
            <div style={{ fontWeight: 700, fontSize: 15, display: "flex", alignItems: "center", gap: 6 }}>
              <Clock size={15} /> Slot Rekomendasi Terdekat (Kosong)
            </div>
            {onGoVideos && (
              <button className="btn btn-sm btn-primary" onClick={onGoVideos}>
                <Film size={12} /> Jadwalkan
              </button>
            )}
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>
            Berdasarkan baseline <strong>1 Long-Form/minggu (Kamis)</strong> + <strong>Shorts (Selasa, Rabu, Jumat, Minggu)</strong>. Uji 3–4 minggu lalu sesuaikan dengan data jam aktif audiens di YouTube Studio.
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {nextRecommendedSlots.map((slot) => (
              <div
                key={slot.dateKey}
                className="card-subtle space-between"
                style={{ alignItems: "center", cursor: "pointer" }}
                onClick={() => {
                  const [y, m] = slot.dateKey.split("-").map(Number);
                  setViewYear(y);
                  setViewMonth(m - 1);
                  setSelectedKey(slot.dateKey);
                }}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{slot.label}</div>
                  <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    YT: {slot.youtube} · FB: {slot.facebook}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <span className={`badge ${slot.slotType === "long" ? "badge-blue" : "badge-amber"}`}>
                    {slot.slotType === "long" ? "LONG" : "SHORT"}
                  </span>
                  <div style={{ fontSize: 11.5, fontWeight: 700, marginTop: 3 }}>{slot.timeWib}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Reference Weekly Schedule Table (Playbook Section 9) */}
      <div className="card" style={{ padding: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>
          Referensi Jadwal Publikasi &amp; Ritme Mingguan (Playbook Sains 60 Detik)
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 12 }}>
          Target bulanan: <strong>4–6 Long-Form (3–5 mnt)</strong> + <strong>12–16 Shorts/Reels</strong> yang diekstrak dari master final. Jam WIB adalah hipotesis awal untuk diuji 3–4 minggu.
        </div>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left", color: "var(--muted)" }}>
                <th style={{ padding: "8px 10px" }}>Hari</th>
                <th style={{ padding: "8px 10px" }}>YouTube</th>
                <th style={{ padding: "8px 10px" }}>Facebook</th>
                <th style={{ padding: "8px 10px" }}>Jam (WIB)</th>
                <th style={{ padding: "8px 10px" }}>Fokus Produksi</th>
              </tr>
            </thead>
            <tbody>
              {WEEKLY_RECOMMENDATIONS.map((r) => (
                <tr
                  key={r.dayName}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.05)",
                    background: r.slotType === "long" ? "rgba(59, 130, 246, 0.08)" : "transparent",
                  }}
                >
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>{r.dayName}</td>
                  <td style={{ padding: "8px 10px" }}>{r.youtube}</td>
                  <td style={{ padding: "8px 10px" }}>{r.facebook}</td>
                  <td style={{ padding: "8px 10px", whiteSpace: "nowrap", fontWeight: 600 }}>{r.timeWib}</td>
                  <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{r.productionFocus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
