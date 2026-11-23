"use client";

import { useState, useEffect } from "react";
import {
  Sparkles,
  RefreshCw,
  FileText,
  Mic,
  Image as ImageIcon,
  PlayCircle,
  CheckCircle2,
  Copy,
  Upload,
  Plus,
  ArrowRight,
  Save,
} from "lucide-react";

const PILLARS = [
  { id: "tech", label: "Tech & Gadget Myths" },
  { id: "health", label: "Body, Food & Health Myths" },
  { id: "physics", label: "Everyday Physics & Objects" },
  { id: "history", label: "History & Viral Claims" },
];

const STEPS = [
  { id: "topic", label: "1. Topic & Title", icon: Sparkles },
  { id: "script", label: "2. Script & Metadata", icon: FileText },
  { id: "audio", label: "3. Audio (VO)", icon: Mic },
  { id: "visuals", label: "4. Visual Assets", icon: ImageIcon },
  { id: "render", label: "5. Compile & Render", icon: PlayCircle },
];

export default function CreateVideoView({ episodes, onRefresh, onToast, onGoVideos }) {
  const [selectedEpId, setSelectedEpId] = useState(episodes[0]?.id || "");
  const [step, setStep] = useState("topic");

  // Step 1: Topic generator
  const [pillar, setPillar] = useState("tech");
  const [customHint, setCustomHint] = useState("");
  const [ideas, setIdeas] = useState([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [selectedIdea, setSelectedIdea] = useState(null);

  // Step 2: Script editor
  const [generatingScript, setGeneratingScript] = useState(false);
  const [scriptJsonText, setScriptJsonText] = useState("");
  const [savingScript, setSavingScript] = useState(false);

  // Step 3: TTS job
  const [ttsJob, setTtsJob] = useState({ status: "idle", logs: [] });
  const [ttsTier, setTtsTier] = useState("free"); // "free" (Gemini TTS) | "paid" (ElevenLabs)
  const [ttsModel, setTtsModel] = useState("eleven_multilingual_v2");
  const [ttsVoice, setTtsVoice] = useState("wvv6DzcHyOVTDgDY7SMW"); // Andi - Clear and confident
  const [ttsForce, setTtsForce] = useState(false);

  // Step 5: Render job
  const [renderJob, setRenderJob] = useState({ status: "idle", logs: [] });

  const currentEp = episodes.find((e) => e.id === selectedEpId) || null;

  useEffect(() => {
    if (!selectedEpId && episodes.length > 0) {
      setSelectedEpId(episodes[0].id);
    }
  }, [episodes, selectedEpId]);

  useEffect(() => {
    if (currentEp?.episode) {
      setScriptJsonText(JSON.stringify(currentEp.episode, null, 2));
    }
  }, [currentEp?.id, currentEp?.episode?.title, currentEp?.episode?.modules?.length]);

  // Poll TTS job while running
  useEffect(() => {
    if (!selectedEpId || ttsJob.status !== "running") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/episodes/${selectedEpId}/tts`);
      const data = await res.json();
      setTtsJob(data);
      if (data.status !== "running") {
        clearInterval(t);
        onRefresh();
      }
    }, 2500);
    return () => clearInterval(t);
  }, [selectedEpId, ttsJob.status, onRefresh]);

  // Poll Render job while running
  useEffect(() => {
    if (!selectedEpId || renderJob.status !== "running") return;
    const t = setInterval(async () => {
      const res = await fetch(`/api/episodes/${selectedEpId}/render`);
      const data = await res.json();
      setRenderJob(data);
      if (data.status !== "running") {
        clearInterval(t);
        onRefresh();
        if (data.status === "done") onToast("🎉 Compile & render selesai! Cek menu Videos/Shorts.");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [selectedEpId, renderJob.status, onRefresh, onToast]);

  async function handleGenerateIdeas() {
    setLoadingIdeas(true);
    try {
      const prevTitles = [
        ...episodes.map((e) => e.episode.title),
        ...ideas.map((i) => i.title),
      ].filter(Boolean);
      const res = await fetch("/api/ai/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pillar, customHint, previousTitles: prevTitles }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal generate ide topik");
      setIdeas(data.ideas || []);
      onToast(`✨ 5 ide judul dibuat via ${data.provider}`);
    } catch (err) {
      onToast(`❌ ${err.message}`);
    } finally {
      setLoadingIdeas(false);
    }
  }

  async function handleSelectIdeaAndCreate(idea) {
    try {
      const res = await fetch("/api/episodes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: idea.slug,
          title: idea.title,
          pillar,
          angle: idea.angle,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal membuat episode");
      setSelectedIdea(idea);
      await onRefresh();
      setSelectedEpId(data.episode.id);
      setStep("script");
      onToast(`✅ Episode "${data.episode.id}" dibuat! Lanjut generate Script & Metadata.`);
    } catch (err) {
      onToast(`❌ ${err.message}`);
    }
  }

  async function handleGenerateScript() {
    if (!currentEp) return;
    setGeneratingScript(true);
    try {
      const res = await fetch("/api/ai/script", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: currentEp.id,
          title: currentEp.episode.title,
          angle: currentEp.episode.angle || selectedIdea?.angle || "",
          myths: selectedIdea?.myths || [],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal generate script");
      setScriptJsonText(JSON.stringify(data.episode.episode, null, 2));
      await onRefresh();
      onToast(`✨ Script + Metadata Long & Shorts dibuat via ${data.provider}`);
    } catch (err) {
      onToast(`❌ ${err.message}`);
    } finally {
      setGeneratingScript(false);
    }
  }

  async function handleSaveScript() {
    if (!currentEp) return;
    setSavingScript(true);
    try {
      const parsed = JSON.parse(scriptJsonText);
      const res = await fetch(`/api/episodes/${currentEp.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ episode: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan episode.json");
      await onRefresh();
      onToast("✅ episode.json berhasil disimpan.");
    } catch (err) {
      onToast(`❌ JSON tidak valid / gagal simpan: ${err.message}`);
    } finally {
      setSavingScript(false);
    }
  }

  async function handleRunTts() {
    if (!currentEp) return;
    const res = await fetch(`/api/episodes/${currentEp.id}/tts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tier: ttsTier,
        model: ttsTier === "paid" ? ttsModel : undefined,
        voice: ttsTier === "paid" ? ttsVoice : undefined,
        force: ttsForce,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      onToast(`❌ ${data.error}`);
      return;
    }
    setTtsJob(data);
    onToast(
      ttsTier === "paid"
        ? `🎙 Proses generate VO (Paid — ElevenLabs ${ttsModel}) dimulai...`
        : "🎙 Proses generate VO (Free — Gemini TTS) dimulai..."
    );
  }

  async function handleUploadAsset(subdir, fileName, file) {
    if (!currentEp || !file) return;
    const fd = new FormData();
    fd.append("file", file);
    fd.append("subdir", subdir);
    fd.append("fileName", fileName);
    try {
      const res = await fetch(`/api/episodes/${currentEp.id}/assets`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal upload aset");
      onToast(`✅ Tersimpan: ${data.savedPath}`);
      await onRefresh();
    } catch (err) {
      onToast(`❌ ${err.message}`);
    }
  }

  async function handleStartRender(mode) {
    if (!currentEp) return;
    const res = await fetch(`/api/episodes/${currentEp.id}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode }),
    });
    const data = await res.json();
    if (!res.ok) {
      onToast(`❌ ${data.error}`);
      return;
    }
    setRenderJob(data);
    onToast(`🎬 Render (${mode}) dimulai di background...`);
  }

  function copyText(text) {
    navigator.clipboard.writeText(text);
    onToast("📋 Prompt disalin ke clipboard.");
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Create Video</h1>
          <p className="page-sub">
            Alur produksi bertahap dengan review gate di setiap tab: Topic → Script &amp; Metadata → VO → Visual → Render.
          </p>
        </div>
        <div className="row">
          <select value={selectedEpId} onChange={(e) => setSelectedEpId(e.target.value)}>
            <option value="">-- Pilih Episode --</option>
            {episodes.map((e) => (
              <option key={e.id} value={e.id}>
                {e.id} — {e.episode.title?.slice(0, 42)}
              </option>
            ))}
          </select>
          <button
            className="btn btn-primary"
            onClick={() => {
              setStep("topic");
              setSelectedIdea(null);
            }}
          >
            <Plus size={14} /> New Episode
          </button>
        </div>
      </div>

      <div className="card">
        {/* 5-Tab Stepper */}
        <div className="tabs">
          {STEPS.map((s) => {
            const Icon = s.icon;
            return (
              <button
                key={s.id}
                className={`tab-btn ${step === s.id ? "active" : ""}`}
                onClick={() => setStep(s.id)}
              >
                <Icon size={14} /> {s.label}
              </button>
            );
          })}
        </div>

        {/* TAB 1: TOPIC & TITLE */}
        {step === "topic" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="grid-2">
              <div className="field">
                <label>Pilar Topik</label>
                <select value={pillar} onChange={(e) => setPillar(e.target.value)}>
                  {PILLARS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Fokus / Arahan Tambahan (opsional)</label>
                <input
                  value={customHint}
                  onChange={(e) => setCustomHint(e.target.value)}
                  placeholder="mis: mitos tentang kopi pagi, AC mobil, atau fast charging..."
                />
              </div>
            </div>

            <div className="row">
              <button className="btn btn-primary" onClick={handleGenerateIdeas} disabled={loadingIdeas}>
                <Sparkles size={14} />{" "}
                {loadingIdeas ? "Generating..." : ideas.length ? "Generate Ulang 5 Judul" : "Generate 5 Ide Judul"}
              </button>
              {currentEp && (
                <button className="btn" onClick={() => setStep("script")}>
                  Lanjut Edit Episode Aktif ({currentEp.id}) <ArrowRight size={14} />
                </button>
              )}
            </div>

            {ideas.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {ideas.map((idea, idx) => (
                  <div key={idx} className="card-subtle space-between" style={{ alignItems: "flex-start" }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 14.5 }}>{idea.title}</div>
                      <div style={{ fontSize: 12.5, color: "var(--muted)", marginTop: 4 }}>{idea.angle}</div>
                      <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3, fontSize: 12.5 }}>
                        {(idea.myths || []).map((m, mi) => (
                          <div key={mi}>
                            <strong style={{ color: "var(--yellow)" }}>Mitos #{mi + 1}:</strong> {m}
                          </div>
                        ))}
                      </div>
                      <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 6 }}>
                        Folder ID: <code>{idea.slug}</code>
                      </div>
                    </div>
                    <button className="btn btn-success btn-sm" onClick={() => handleSelectIdeaAndCreate(idea)}>
                      Pilih &amp; Buat Episode <ArrowRight size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SCRIPT & METADATA */}
        {step === "script" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {!currentEp ? (
              <div style={{ color: "var(--muted)" }}>Pilih episode dulu atau buat baru di Tab 1.</div>
            ) : (
              <>
                <div className="space-between">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{currentEp.episode.title}</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Modul: {(currentEp.episode.modules || []).length} · Estimasi Durasi Long:{" "}
                      {currentEp.deliverables.long.duration}s
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn btn-polish" onClick={handleGenerateScript} disabled={generatingScript}>
                      <Sparkles size={14} />{" "}
                      {generatingScript ? "Generating Script..." : "Generate Script + Metadata (AI)"}
                    </button>
                    <button className="btn btn-primary" onClick={handleSaveScript} disabled={savingScript}>
                      <Save size={14} /> {savingScript ? "Menyimpan..." : "Simpan episode.json"}
                    </button>
                    <button className="btn btn-success" onClick={() => setStep("audio")}>
                      Approve &amp; Lanjut Audio <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                {/* Quick visual summary of modules */}
                {(currentEp.episode.modules || []).length > 0 && (
                  <div className="grid-3">
                    {currentEp.episode.modules.map((m, idx) => (
                      <div key={m.id} className="card-subtle">
                        <div className="badge badge-blue" style={{ marginBottom: 6 }}>
                          Modul #{idx + 1} · {m.id}
                        </div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{m.title}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          {(m.beats || []).length} beats ·{" "}
                          {(m.beats || []).reduce((a, b) => a + Number(b.duration || 0), 0).toFixed(1)}s
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="field">
                  <label>
                    <span>Editor `episode.json` (Script, Beats, Visual Prompts &amp; Metadata)</span>
                    <span className="field-hint">Edit bebas lalu klik Simpan</span>
                  </label>
                  <textarea
                    rows={18}
                    style={{ fontFamily: "ui-monospace, Consolas, monospace", fontSize: 12 }}
                    value={scriptJsonText}
                    onChange={(e) => setScriptJsonText(e.target.value)}
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 3: AUDIO (VO) */}
        {step === "audio" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!currentEp ? (
              <div style={{ color: "var(--muted)" }}>Pilih episode dulu.</div>
            ) : (
              <>
                <div className="space-between">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Voiceover &amp; Audio Preview</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Jalankan <code>scripts/tts_generate.py</code> untuk membuat VO &amp; <code>words.json</code>.
                    </div>
                  </div>
                  <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                    <select
                      className="input"
                      style={{ width: "auto", minWidth: 190 }}
                      value={ttsTier}
                      onChange={(e) => setTtsTier(e.target.value)}
                      disabled={ttsJob.status === "running"}
                    >
                      <option value="free">Free — Gemini TTS (0 cr)</option>
                      <option value="paid">Paid — ElevenLabs</option>
                    </select>
                    {ttsTier === "paid" && (
                      <>
                        <select
                          className="input"
                          style={{ width: "auto", minWidth: 215 }}
                          value={ttsVoice}
                          onChange={(e) => setTtsVoice(e.target.value)}
                          disabled={ttsJob.status === "running"}
                        >
                          <option value="wvv6DzcHyOVTDgDY7SMW">Andi — Clear &amp; Confident (Free/Paid)</option>
                          <option value="TMvmhlKUioQA4U7LOoko">Andi — Friendly &amp; Calm (Paid Plan)</option>
                        </select>
                        <select
                          className="input"
                          style={{ width: "auto", minWidth: 205 }}
                          value={ttsModel}
                          onChange={(e) => setTtsModel(e.target.value)}
                          disabled={ttsJob.status === "running"}
                        >
                          <option value="eleven_multilingual_v2">Multilingual v2 (1 cr/char)</option>
                          <option value="eleven_flash_v2_5">Flash v2.5 (0.5 cr/char)</option>
                        </select>
                      </>
                    )}
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12, color: "var(--muted)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={ttsForce}
                        onChange={(e) => setTtsForce(e.target.checked)}
                        disabled={ttsJob.status === "running"}
                      />
                      Force
                    </label>
                    <button
                      className="btn btn-primary"
                      onClick={handleRunTts}
                      disabled={ttsJob.status === "running"}
                    >
                      <Mic size={14} />{" "}
                      {ttsJob.status === "running"
                        ? "Generating VO..."
                        : ttsTier === "paid"
                        ? "Generate VO (ElevenLabs)"
                        : "Generate VO (Gemini Free)"}
                    </button>
                    <button className="btn btn-success" onClick={() => setStep("visuals")}>
                      Approve &amp; Lanjut Visual <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                {(() => {
                  const ep = currentEp.episode || {};
                  const beats = [
                    ...(ep.intro?.beats || []),
                    ...(ep.modules || []).flatMap((m) => m.beats || []),
                    ...(ep.outro?.beats || []),
                  ];
                  const chars = beats.reduce((acc, b) => acc + ((b.narration || "").trim().length), 0);
                  const mult = ttsModel === "eleven_flash_v2_5" ? 0.5 : 1;
                  const estCredits = Math.round(chars * mult);
                  return (
                    <div className="card-subtle" style={{ fontSize: 12.5, display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
                      <span>
                        Total narasi: <strong>{chars.toLocaleString()} karakter</strong> ({beats.length} beats)
                      </span>
                      <span>
                        Estimasi biaya:{" "}
                        {ttsTier === "paid" ? (
                          <strong>~{estCredits.toLocaleString()} ElevenLabs credits</strong>
                        ) : (
                          <strong>0 ElevenLabs credits (Gemini TTS Free)</strong>
                        )}
                      </span>
                    </div>
                  );
                })()}

                {ttsJob.logs?.length > 0 && <div className="log-box">{ttsJob.logs.join("\n")}</div>}

                <div className="grid-2">
                  {(currentEp.audioFiles || []).length === 0 ? (
                    <div className="card-subtle" style={{ color: "var(--muted)" }}>
                      Belum ada file audio di <code>episodes/{currentEp.id}/audio/</code>.
                    </div>
                  ) : (
                    currentEp.audioFiles.map((f) => (
                      <div key={f.name} className="card-subtle" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div className="space-between">
                          <span style={{ fontWeight: 600, fontSize: 13 }}>{f.name}</span>
                          <span style={{ fontSize: 11.5, color: "var(--muted)" }}>
                            {(f.size / 1024).toFixed(0)} KB
                          </span>
                        </div>
                        <audio controls src={`/api/media/${currentEp.id}/audio/${f.name}`} style={{ width: "100%" }} />
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 4: VISUAL ASSETS */}
        {step === "visuals" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {!currentEp ? (
              <div style={{ color: "var(--muted)" }}>Pilih episode dulu.</div>
            ) : (
              <>
                <div className="space-between">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Visual Assets (GATE 2A Stills &amp; GATE 2B Veo Clips)</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Copy prompt ke Google Flow lalu upload file hasil generate langsung ke slot di bawah (otomatis tersimpan ke <code>assets/</code>).
                    </div>
                  </div>
                  <div className="row">
                    <button className="btn" onClick={onRefresh}>
                      <RefreshCw size={14} /> Scan Folder
                    </button>
                    <button className="btn btn-success" onClick={() => setStep("render")}>
                      Approve &amp; Lanjut Render <ArrowRight size={14} />
                    </button>
                  </div>
                </div>

                {/* GATE 2A Stills */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>
                    GATE 2A — 3D Stills ({currentEp.assets.stills.filter((s) => s.exists).length}/
                    {currentEp.assets.stills.length} ready)
                  </div>
                  <div className="grid-3">
                    {currentEp.assets.stills.map((s) => (
                      <div key={s.src} className="card-subtle" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div className="space-between">
                          <code style={{ fontSize: 11.5 }}>{s.fileName}</code>
                          {s.exists ? (
                            <span className="badge badge-green">
                              <CheckCircle2 size={11} /> Ready
                            </span>
                          ) : (
                            <span className="badge badge-amber">Missing</span>
                          )}
                        </div>
                        {s.exists && (
                          <img
                            src={`/api/media/${currentEp.id}/${s.src}`}
                            alt={s.fileName}
                            style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6 }}
                          />
                        )}
                        {s.prompt && (
                          <button className="btn btn-sm" onClick={() => copyText(s.prompt)}>
                            <Copy size={12} /> Copy Prompt
                          </button>
                        )}
                        <label className="btn btn-sm btn-primary" style={{ width: "100%" }}>
                          <Upload size={12} /> {s.exists ? "Ganti Still" : "Upload Still"}
                          <input
                            type="file"
                            accept="image/*"
                            style={{ display: "none" }}
                            onChange={(e) => handleUploadAsset("stills", s.fileName, e.target.files?.[0])}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>

                {/* GATE 2B Veo Clips */}
                <div>
                  <div style={{ fontWeight: 700, marginBottom: 10 }}>
                    GATE 2B — Veo Hero Clips ({currentEp.assets.clips.filter((c) => c.exists).length}/
                    {currentEp.assets.clips.length} ready)
                  </div>
                  <div className="grid-3">
                    {currentEp.assets.clips.map((c) => (
                      <div key={c.src} className="card-subtle" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <div className="space-between">
                          <code style={{ fontSize: 11.5 }}>{c.fileName}</code>
                          {c.exists ? (
                            <span className="badge badge-green">
                              <CheckCircle2 size={11} /> Ready
                            </span>
                          ) : (
                            <span className="badge badge-amber">Missing</span>
                          )}
                        </div>
                        {c.exists && (
                          <video
                            controls
                            muted
                            src={`/api/media/${currentEp.id}/${c.src}`}
                            style={{ width: "100%", height: 120, objectFit: "cover", borderRadius: 6, background: "#000" }}
                          />
                        )}
                        {c.prompt && (
                          <button className="btn btn-sm" onClick={() => copyText(c.prompt)}>
                            <Copy size={12} /> Copy Prompt
                          </button>
                        )}
                        <label className="btn btn-sm btn-primary" style={{ width: "100%" }}>
                          <Upload size={12} /> {c.exists ? "Ganti Clip" : "Upload MP4"}
                          <input
                            type="file"
                            accept="video/mp4,video/*"
                            style={{ display: "none" }}
                            onChange={(e) => handleUploadAsset("clips", c.fileName, e.target.files?.[0])}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {/* TAB 5: COMPILE & RENDER */}
        {step === "render" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {!currentEp ? (
              <div style={{ color: "var(--muted)" }}>Pilih episode dulu.</div>
            ) : (
              <>
                <div className="space-between">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>Compile &amp; Batch Render (HyperFrames)</div>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                      Menjalankan <code>build_episode.mjs</code> + <code>hyperframes render</code> untuk 1 Long 16:9 +{" "}
                      {(currentEp.episode.modules || []).length} Shorts 9:16.
                    </div>
                  </div>
                  <div className="row">
                    <button
                      className="btn"
                      onClick={() => handleStartRender("compile")}
                      disabled={renderJob.status === "running"}
                    >
                      Compile HTML Only
                    </button>
                    <button
                      className="btn"
                      onClick={() => handleStartRender("long")}
                      disabled={renderJob.status === "running"}
                    >
                      Render Long Only
                    </button>
                    <button
                      className="btn btn-primary"
                      onClick={() => handleStartRender("all")}
                      disabled={renderJob.status === "running"}
                    >
                      <PlayCircle size={14} />{" "}
                      {renderJob.status === "running" ? "Rendering..." : "Compile & Render All"}
                    </button>
                  </div>
                </div>

                {/* Output readiness summary */}
                <div className="grid-2">
                  <div className="card-subtle space-between">
                    <div>
                      <div style={{ fontWeight: 600 }}>Long-Form 16:9</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {currentEp.deliverables.long.videoFile || "Belum dirender"}
                      </div>
                    </div>
                    {currentEp.deliverables.long.videoFile ? (
                      <span className="badge badge-green">Ready</span>
                    ) : (
                      <span className="badge badge-slate">Pending</span>
                    )}
                  </div>
                  <div className="card-subtle space-between">
                    <div>
                      <div style={{ fontWeight: 600 }}>Shorts 9:16</div>
                      <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        {currentEp.deliverables.shorts.filter((s) => s.videoFile).length}/
                        {currentEp.deliverables.shorts.length} file MP4 siap
                      </div>
                    </div>
                    <button className="btn btn-sm btn-success" onClick={onGoVideos}>
                      Buka Videos/Shorts <ArrowRight size={13} />
                    </button>
                  </div>
                </div>

                {renderJob.logs?.length > 0 && <div className="log-box">{renderJob.logs.join("\n")}</div>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
