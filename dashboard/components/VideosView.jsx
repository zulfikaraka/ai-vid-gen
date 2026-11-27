"use client";

import { useState, useMemo } from "react";
import {
  Film,
  Smartphone,
  Sparkles,
  Upload,
  ExternalLink,
  X,
  Save,
  Clock,
  CheckCircle2,
  CircleDashed,
  RefreshCw,
} from "lucide-react";

function formatDateTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function StatusBadge({ status }) {
  if (status === "uploaded") {
    return (
      <span className="badge badge-green">
        <CheckCircle2 size={12} /> Uploaded
      </span>
    );
  }
  if (status === "scheduled") {
    return (
      <span className="badge badge-amber">
        <Clock size={12} /> Scheduled
      </span>
    );
  }
  return (
    <span className="badge badge-slate">
      <CircleDashed size={12} /> Not Uploaded
    </span>
  );
}

export default function VideosView({ episodes, accounts, onRefresh, onToast }) {
  const [activeTab, setActiveTab] = useState("long"); // "long" | "short"
  const [episodeFilter, setEpisodeFilter] = useState("all");
  const [selected, setSelected] = useState(null);

  // Detail Drawer Form State
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [polishInstruction, setPolishInstruction] = useState("");
  const [polishProvider, setPolishProvider] = useState("auto"); // "auto" | "gemini" | "groq"
  const [polishing, setPolishing] = useState(false);
  const [saving, setSaving] = useState(false);

  // Upload Form State
  const youtubeChannels = accounts?.youtube || [];
  const defaultChannelId =
    youtubeChannels.find((c) => c.isDefault)?.id || youtubeChannels[0]?.id || "";
  const [channelId, setChannelId] = useState("");
  const [publishMode, setPublishMode] = useState("schedule"); // "public" | "schedule" | "unlisted" | "private"
  const [scheduleLocal, setScheduleLocal] = useState("");
  const [uploading, setUploading] = useState(false);

  const longVideos = useMemo(() => {
    return episodes
      .filter((e) => episodeFilter === "all" || e.id === episodeFilter)
      .map((e) => e.deliverables.long);
  }, [episodes, episodeFilter]);

  const shortVideos = useMemo(() => {
    return episodes
      .filter((e) => episodeFilter === "all" || e.id === episodeFilter)
      .flatMap((e) => e.deliverables.shorts);
  }, [episodes, episodeFilter]);

  const rows = activeTab === "long" ? longVideos : shortVideos;

  function openDetail(item) {
    setSelected(item);
    setTitle(item.metadata?.title || "");
    setDescription(item.metadata?.description || "");
    setTagsText((item.metadata?.tags || []).join(", "));
    setPolishInstruction("");
    setChannelId(defaultChannelId);
    setPublishMode(item.kind === "long" ? "public" : "schedule");

    // Default schedule: tomorrow 18:00 local
    const tmr = new Date();
    tmr.setDate(tmr.getDate() + 1);
    tmr.setHours(18, 0, 0, 0);
    const pad = (n) => String(n).padStart(2, "0");
    setScheduleLocal(
      `${tmr.getFullYear()}-${pad(tmr.getMonth() + 1)}-${pad(tmr.getDate())}T${pad(tmr.getHours())}:${pad(tmr.getMinutes())}`
    );
  }

  async function handleSaveDraft() {
    if (!selected) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/episodes/${selected.episodeId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "save_metadata",
          kind: selected.kind,
          moduleId: selected.moduleId,
          title,
          description,
          tags: tagsText,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan draft");
      onToast("✅ Draft metadata disimpan ke episode.json");
      await onRefresh();
    } catch (err) {
      onToast(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function handlePolish() {
    if (!selected) return;
    setPolishing(true);
    try {
      const chName =
        youtubeChannels.find((c) => c.id === (channelId || defaultChannelId))?.title || "Sains 60 Detik";
      const res = await fetch("/api/ai/polish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: selected.episodeId,
          kind: selected.kind,
          moduleId: selected.moduleId,
          title,
          description,
          tags: tagsText
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          instruction: polishInstruction,
          channelName: chName,
          provider: polishProvider,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal polish AI");
      setTitle(data.polished.title || title);
      setDescription(data.polished.description || description);
      setTagsText((data.polished.tags || []).join(", "));
      onToast(`✨ Polished via ${data.provider} & tersimpan otomatis!`);
      await onRefresh();
    } catch (err) {
      onToast(`❌ ${err.message}`);
    } finally {
      setPolishing(false);
    }
  }

  function handleCombineTitleTags() {
    if (!title) return;
    const isShorts = selected?.kind === "short";
    const descTags = description.match(/#[\w\d_]+/g) || [];
    const fromTags = tagsText
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean)
      .map((t) => (t.startsWith("#") ? t : `#${t}`));
    const sourceHashtags = descTags.length > 0 ? descTags : fromTags;

    const cleanTitle = title
      .replace(/#[\w\d_]+/g, "")
      .replace(/\s+/g, " ")
      .trim();

    const viralLeadTags = isShorts
      ? ["#fyp", "#viral", "#foryou", "#foryoupage", "#trending", "#Shorts"]
      : ["#fyp", "#viral", "#foryou", "#foryoupage", "#trending"];

    const seen = new Set();
    const prioritized = [];
    for (const t of [...viralLeadTags, ...sourceHashtags]) {
      const lower = t.toLowerCase();
      if (!seen.has(lower)) {
        seen.add(lower);
        prioritized.push(t);
      }
    }

    const tagsStr = prioritized.join(" ");
    let fullText = `${cleanTitle} ${tagsStr}`.trim();

    if (fullText.length > 100) {
      fullText = fullText.substring(0, 100);
      const originalNextChar = `${cleanTitle} ${tagsStr}`.charAt(100);
      if (originalNextChar !== " " && originalNextChar !== "") {
        const lastSpaceIndex = fullText.lastIndexOf(" ");
        if (lastSpaceIndex > 0) {
          fullText = fullText.substring(0, lastSpaceIndex);
        }
      }
    }

    const resTitle = fullText.trim() || cleanTitle;
    setTitle(resTitle);
    onToast("✨ Judul + #Tags berhasil di-generate!");
  }

  async function handleUpload() {
    if (!selected) return;
    if (!selected.videoFile) {
      onToast("❌ File MP4 belum dirender. Jalankan Compile & Render dulu di menu Create Video.");
      return;
    }

    // Save latest edits first
    await handleSaveDraft();

    let publishAt = null;
    let privacy = publishMode;
    if (publishMode === "schedule") {
      if (!scheduleLocal) {
        onToast("❌ Pilih tanggal & jam jadwal tayang dulu.");
        return;
      }
      publishAt = new Date(scheduleLocal).toISOString();
      privacy = "private";
    }

    setUploading(true);
    try {
      const res = await fetch("/api/youtube/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          episodeId: selected.episodeId,
          kind: selected.kind,
          moduleId: selected.moduleId,
          channelId: channelId || defaultChannelId,
          privacy,
          publishAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload gagal");
      onToast(`🎉 Berhasil upload ke YouTube: ${data.record.url}`);
      await onRefresh();
      setSelected(null);
    } catch (err) {
      onToast(`❌ ${err.message}`);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Videos / Shorts</h1>
          <p className="page-sub">
            Review draft hasil render, polish Title/Description/Tags dengan AI, lalu upload atau jadwalkan ke YouTube.
          </p>
        </div>
        <div className="row">
          <select value={episodeFilter} onChange={(e) => setEpisodeFilter(e.target.value)}>
            <option value="all">Semua Episode ({episodes.length})</option>
            {episodes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id}
              </option>
            ))}
          </select>
          <button className="btn" onClick={onRefresh}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="card">
        <div className="tabs">
          <button
            className={`tab-btn ${activeTab === "long" ? "active" : ""}`}
            onClick={() => setActiveTab("long")}
          >
            <Film size={15} /> Long Videos 16:9 ({longVideos.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "short" ? "active" : ""}`}
            onClick={() => setActiveTab("short")}
          >
            <Smartphone size={15} /> Shorts 9:16 ({shortVideos.length})
          </button>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 112 }}>Thumbnail</th>
                <th>Judul Video</th>
                <th style={{ width: 145 }}>Status Upload</th>
                <th style={{ width: 185 }}>Date &amp; Time Upload</th>
                <th style={{ width: 110, textAlign: "right" }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: "center", padding: 32, color: "var(--muted)" }}>
                    Belum ada video di tab ini. Buat &amp; render episode dulu di menu <strong>Create Video</strong>.
                  </td>
                </tr>
              ) : (
                rows.map((item) => (
                  <tr key={item.key}>
                    <td>
                      {item.thumbnail ? (
                        <img
                          src={`/api/media/${item.episodeId}/${item.thumbnail}`}
                          alt={item.metadata?.title || "thumb"}
                          className={activeTab === "long" ? "thumb-sm" : "thumb-short"}
                        />
                      ) : (
                        <div
                          className={activeTab === "long" ? "thumb-sm" : "thumb-short"}
                          style={{
                            display: "grid",
                            placeItems: "center",
                            fontSize: 10,
                            color: "var(--muted)",
                          }}
                        >
                          No Thumb
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{item.metadata?.title || item.episodeTitle}</div>
                      <div className="row" style={{ marginTop: 4, gap: 6, fontSize: 12, color: "var(--muted)" }}>
                        <span>{item.episodeId}</span>
                        <span>·</span>
                        <span>{item.duration}s</span>
                        {item.videoFile ? (
                          <span className="badge badge-blue">
                            MP4 Ready ({(item.videoSize / (1024 * 1024)).toFixed(1)} MB)
                          </span>
                        ) : (
                          <span className="badge badge-red">Belum Render</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <StatusBadge status={item.status} />
                      {item.youtubeUrl && (
                        <div style={{ marginTop: 4 }}>
                          <a
                            href={item.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ fontSize: 11.5, display: "inline-flex", alignItems: "center", gap: 4 }}
                          >
                            Buka YouTube <ExternalLink size={11} />
                          </a>
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5, color: item.uploadDate ? "var(--text)" : "var(--muted)" }}>
                      {formatDateTime(item.uploadDate)}
                      {item.channelName && (
                        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{item.channelName}</div>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button className="btn btn-sm btn-primary" onClick={() => openDetail(item)}>
                        Detail
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Slide-Over Drawer */}
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="drawer" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div>
                <div style={{ fontWeight: 700, fontSize: 15.5 }}>
                  {selected.kind === "long" ? "Long Video Detail (16:9)" : "Short Video Detail (9:16)"}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                  {selected.episodeId} {selected.moduleId ? `· ${selected.moduleId}` : ""}
                </div>
              </div>
              <button className="btn btn-sm" onClick={() => setSelected(null)}>
                <X size={15} />
              </button>
            </div>

            <div className="drawer-body">
              {/* Local Video Preview */}
              {selected.videoFile ? (
                <div
                  style={{
                    flexShrink: 0,
                    background: "#050914",
                    borderRadius: 10,
                    border: "1px solid var(--border)",
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <video
                    id="detail-video-player"
                    key={selected.key}
                    controls
                    playsInline
                    preload="metadata"
                    src={`/api/media/${selected.episodeId}/${selected.videoFile}`}
                    style={{
                      width: "100%",
                      height: selected.kind === "short" ? 440 : 380,
                      objectFit: "contain",
                      display: "block",
                      background: "#000",
                      borderRadius: 6,
                    }}
                  />
                  <div className="space-between" style={{ fontSize: 12, color: "var(--muted)" }}>
                    <span>
                      {selected.videoFile} · {(selected.videoSize / (1024 * 1024)).toFixed(1)} MB
                    </span>
                    <div className="row" style={{ gap: 8 }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => {
                          const v = document.getElementById("detail-video-player");
                          if (v?.requestFullscreen) v.requestFullscreen();
                        }}
                      >
                        Fullscreen
                      </button>
                      <a
                        href={`/api/media/${selected.episodeId}/${selected.videoFile}`}
                        target="_blank"
                        rel="noreferrer"
                        className="btn btn-sm"
                        style={{ textDecoration: "none" }}
                      >
                        Buka Tab Baru <ExternalLink size={12} />
                      </a>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="card-subtle" style={{ color: "#fca5a5" }}>
                  File MP4 belum tersedia. Render dulu di menu <strong>Create Video → Tab Compile &amp; Render</strong>.
                </div>
              )}

              {/* AI Polish Bar */}
              <div className="card-subtle" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div className="space-between">
                  <span style={{ fontWeight: 600, fontSize: 13 }}>✨ AI Polish (Copywriting &amp; SEO)</span>
                  <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                    Revisi otomatis Title, Description &amp; Tags
                  </span>
                </div>
                <div className="row">
                  <input
                    style={{ flex: 1, minWidth: 200 }}
                    placeholder="Instruksi revisi opsional (mis: buat lebih penasaran, tambah hashtag baterai HP)..."
                    value={polishInstruction}
                    onChange={(e) => setPolishInstruction(e.target.value)}
                  />
                  <select
                    value={polishProvider}
                    onChange={(e) => setPolishProvider(e.target.value)}
                    title="Pilih AI Provider"
                    style={{ width: 155 }}
                  >
                    <option value="auto">Auto (Default)</option>
                    <option value="antigravity">Antigravity</option>
                    <option value="gemini">Gemini</option>
                    <option value="groq">Groq</option>
                  </select>
                  <button className="btn btn-polish" onClick={handlePolish} disabled={polishing}>
                    <Sparkles size={14} /> {polishing ? "Polishing..." : "Polish"}
                  </button>
                </div>
              </div>

              {/* Editable Fields: Title, Description, Tags */}
              <div className="field">
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>Title (Judul + #Tags)</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                      type="button"
                      className="btn btn-sm"
                      onClick={handleCombineTitleTags}
                      title="Gabungkan judul saat ini dengan hashtag viral agar pas di bawah 100 karakter (seperti Clipper AI)"
                      style={{ padding: "2px 8px", fontSize: 11, height: "auto" }}
                    >
                      ✨ Judul + #Tags
                    </button>
                    <span className="field-hint">{title.length}/100 karakter</span>
                  </div>
                </label>
                <input
                  value={title}
                  maxLength={100}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Judul video YouTube..."
                />
              </div>

              <div className="field">
                <label>
                  <span>Description</span>
                  <span className="field-hint">{description.length}/5000 karakter</span>
                </label>
                <textarea
                  rows={8}
                  value={description}
                  maxLength={5000}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Deskripsi video, chapters, dan hashtags..."
                />
              </div>

              <div className="field">
                <label>
                  <span>Tags (pisahkan dengan koma)</span>
                  <span className="field-hint">
                    {tagsText.split(",").filter((t) => t.trim()).length} tags
                  </span>
                </label>
                <input
                  value={tagsText}
                  onChange={(e) => setTagsText(e.target.value)}
                  placeholder="Sains 60 Detik, fakta sains, mitos baterai..."
                />
              </div>

              {/* Upload / Schedule Panel */}
              <div className="card-subtle" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13.5 }}>Upload / Schedule ke YouTube</div>
                <div className="grid-2">
                  <div className="field">
                    <label>Target Channel</label>
                    <select
                      value={channelId || defaultChannelId}
                      onChange={(e) => setChannelId(e.target.value)}
                    >
                      {youtubeChannels.length === 0 ? (
                        <option value="">Belum ada channel terhubung</option>
                      ) : (
                        youtubeChannels.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title} {c.isDefault ? "(Default)" : ""}
                          </option>
                        ))
                      )}
                    </select>
                  </div>

                  <div className="field">
                    <label>Mode Tayang</label>
                    <select value={publishMode} onChange={(e) => setPublishMode(e.target.value)}>
                      <option value="public">Public Sekarang</option>
                      <option value="schedule">Schedule (Jadwal Tayang)</option>
                      <option value="unlisted">Unlisted</option>
                      <option value="private">Private</option>
                    </select>
                  </div>
                </div>

                {publishMode === "schedule" && (() => {
                  const [datePart = "", timePart = "18:30"] = (scheduleLocal || "").split("T");
                  const timeOptions = [];
                  for (let h = 6; h <= 23; h++) {
                    for (const m of [0, 30]) {
                      timeOptions.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
                    }
                  }
                  if (timePart && !timeOptions.includes(timePart)) {
                    timeOptions.push(timePart);
                    timeOptions.sort();
                  }
                  const setDateAndTime = (d, t) => {
                    if (!d) return;
                    setScheduleLocal(`${d}T${t || "18:30"}`);
                  };
                  // Quick-pick upcoming recommended slots from Playbook
                  const quickSlots = [];
                  const wantLong = selected?.kind === "long";
                  const targetDows = wantLong ? [4, 6] : [2, 3, 5, 0]; // Kam/Sab for Long; Sel/Rab/Jum/Min for Shorts
                  const dayNames = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
                  const now = new Date();
                  for (let offset = 0; offset < 14 && quickSlots.length < 4; offset++) {
                    const dt = new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset);
                    if (!targetDows.includes(dt.getDay())) continue;
                    const y = dt.getFullYear();
                    const mo = String(dt.getMonth() + 1).padStart(2, "0");
                    const da = String(dt.getDate()).padStart(2, "0");
                    const hh = wantLong ? "19:00" : "18:30";
                    quickSlots.push({
                      key: `${y}-${mo}-${da}T${hh}`,
                      date: `${y}-${mo}-${da}`,
                      time: hh,
                      label: `${dayNames[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1} · ${hh}`,
                    });
                  }

                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <div className="grid-2">
                        <div className="field">
                          <label>Tanggal Tayang</label>
                          <input
                            type="date"
                            value={datePart}
                            onChange={(e) => setDateAndTime(e.target.value, timePart)}
                            onClick={(e) => e.currentTarget.showPicker?.()}
                            onKeyDown={(e) => e.preventDefault()}
                            style={{ cursor: "pointer", colorScheme: "dark" }}
                          />
                        </div>
                        <div className="field">
                          <label>Jam Tayang (WIB)</label>
                          <select
                            value={timePart}
                            onChange={(e) => setDateAndTime(datePart, e.target.value)}
                          >
                            {timeOptions.map((t) => (
                              <option key={t} value={t}>
                                {t} WIB
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>Rekomendasi cepat:</span>
                        {quickSlots.map((qs) => (
                          <button
                            key={qs.key}
                            type="button"
                            className={`btn btn-sm ${scheduleLocal === qs.key ? "btn-primary" : ""}`}
                            style={{ padding: "3px 8px", fontSize: 11 }}
                            onClick={() => setDateAndTime(qs.date, qs.time)}
                          >
                            {qs.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {selected.youtubeUrl && (
                  <div style={{ fontSize: 12.5, color: "#86efac" }}>
                    Sudah pernah di-upload:{" "}
                    <a href={selected.youtubeUrl} target="_blank" rel="noreferrer">
                      {selected.youtubeUrl}
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="drawer-footer">
              <button className="btn" onClick={handleSaveDraft} disabled={saving}>
                <Save size={14} /> {saving ? "Menyimpan..." : "Simpan Draft"}
              </button>
              <button
                className="btn btn-success"
                onClick={handleUpload}
                disabled={uploading || !selected.videoFile || youtubeChannels.length === 0}
              >
                <Upload size={14} />{" "}
                {uploading
                  ? "Mengupload ke YouTube..."
                  : publishMode === "schedule"
                    ? "Schedule Upload"
                    : "Upload ke YouTube"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
