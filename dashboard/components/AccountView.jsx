"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Youtube,
  Plus,
  Star,
  Trash2,
  CheckCircle2,
  Share2,
  Sparkles,
  Mic,
  RefreshCw,
  KeyRound,
  Save,
  Info,
  Cpu,
} from "lucide-react";

const PREMADE_VOICES = [
  { id: "CwhRBWXzGAHq8TQ4Fs17", label: "Roger — Premade (Free & Paid API)" },
  { id: "JBFqnCBsd6RMkjVDRZzb", label: "George — Premade (Free & Paid API)" },
  { id: "EXAVITQu4vr4xnSDxMaL", label: "Sarah — Premade (Free & Paid API)" },
  { id: "wvv6DzcHyOVTDgDY7SMW", label: "Andi — Voice Library (Butuh Starter+ API)" },
];

export default function AccountView({ accounts, onRefresh, onToast }) {
  const youtubeList = accounts?.youtube || [];

  const [integ, setInteg] = useState(null);
  const [loadingInteg, setLoadingInteg] = useState(true);
  const [syncingFlow, setSyncingFlow] = useState(false);
  const [savingKey, setSavingKey] = useState("");

  // Form states
  const [flowProjectId, setFlowProjectId] = useState("");
  const [elKeyInput, setElKeyInput] = useState("");
  const [elVoiceInput, setElVoiceInput] = useState("CwhRBWXzGAHq8TQ4Fs17");
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [groqKeyInput, setGroqKeyInput] = useState("");

  const loadIntegrations = useCallback(async (refreshFlow = false) => {
    if (refreshFlow) setSyncingFlow(true);
    else setLoadingInteg(true);
    try {
      const res = await fetch(refreshFlow ? "/api/integrations?refreshFlow=1" : "/api/integrations");
      const data = await res.json();
      setInteg(data);
      if (data.flow?.projectId) setFlowProjectId(data.flow.projectId);
      if (data.elevenlabs?.voiceId) setElVoiceInput(data.elevenlabs.voiceId);
      if (refreshFlow) {
        if (data.flow?.signedIn && data.flow?.inProject) {
          onToast(`✅ Google Flow terhubung (${data.flow.plan || "active"} · ${data.flow.credits ?? "?"} cr)`);
        } else {
          onToast(`⚠️ ${data.flow?.hint || data.flow?.error || "Silakan login Google Flow di jendela Chrome yang terbuka."}`);
        }
        onRefresh();
      }
    } catch (err) {
      onToast(`❌ Gagal memuat integrasi: ${err.message}`);
    } finally {
      setLoadingInteg(false);
      setSyncingFlow(false);
    }
  }, [onRefresh, onToast]);

  useEffect(() => {
    loadIntegrations(false);
  }, [loadIntegrations]);

  async function saveEnv(tag, values) {
    setSavingKey(tag);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save_env", values }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Gagal menyimpan konfigurasi");
      setInteg(data);
      if (values.ELEVENLABS_API_KEY) setElKeyInput("");
      if (values.GEMINI_API_KEY) setGeminiKeyInput("");
      if (values.GROQ_API_KEY) setGroqKeyInput("");
      onToast("✅ Konfigurasi tersimpan ke ai-vid-gen/.env");
      onRefresh();
    } catch (err) {
      onToast(`❌ ${err.message}`);
    } finally {
      setSavingKey("");
    }
  }

  async function handleSetDefault(channelId) {
    try {
      const res = await fetch("/api/accounts", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      if (!res.ok) throw new Error("Gagal mengubah default channel");
      onToast("✅ Default YouTube channel diperbarui.");
      onRefresh();
    } catch (err) {
      onToast(`❌ ${err.message}`);
    }
  }

  async function handleDisconnect(channelId, title) {
    if (!confirm(`Putuskan koneksi channel "${title}" dari dashboard?`)) return;
    try {
      const res = await fetch("/api/accounts", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId }),
      });
      if (!res.ok) throw new Error("Gagal memutus koneksi channel");
      onToast(`✅ Channel "${title}" diputus.`);
      onRefresh();
    } catch (err) {
      onToast(`❌ ${err.message}`);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div className="page-header">
        <div>
          <h1 className="page-title">Account &amp; Integrations</h1>
          <p className="page-sub">
            Kelola koneksi channel publikasi (YouTube/Facebook) serta akun produksi AI (Google Flow, ElevenLabs, Gemini, Groq).
          </p>
        </div>
      </div>

      {/* 1. Google Flow Section */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="space-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="row">
            <Sparkles size={21} color="#60a5fa" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Google Flow (Visual Generator — Stills &amp; Veo Clips)</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Berjalan lewat Chrome khusus <code>flow-mcp</code> (CDP port <code>9333</code>) · Memakai kuota Google AI Pro (0 cr stills, ~20 cr/Veo Fast clip).
              </div>
            </div>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {integ?.flow?.signedIn && integ?.flow?.inProject ? (
              <span className="badge badge-green">
                <CheckCircle2 size={12} /> Connected · {integ.flow.credits ?? "?"} cr
              </span>
            ) : (
              <span className="badge badge-amber">Belum Disinkronkan</span>
            )}
            <button
              className="btn btn-primary btn-sm"
              onClick={() => loadIntegrations(true)}
              disabled={syncingFlow}
            >
              <RefreshCw size={13} /> {syncingFlow ? "Menghubungkan..." : "Buka Chrome Flow / Sync"}
            </button>
          </div>
        </div>

        <div className="card-subtle" style={{ fontSize: 12.5, display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="row" style={{ gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
            <div className="field" style={{ flex: 1, minWidth: 260 }}>
              <label>Default Flow Project ID (UUID dari URL <code>flow.google.com/project/&lt;uuid&gt;</code>)</label>
              <input
                value={flowProjectId}
                onChange={(e) => setFlowProjectId(e.target.value)}
                placeholder="75f37628-085c-4e79-845f-94b6597b771a"
              />
            </div>
            <button
              className="btn btn-sm"
              disabled={savingKey === "flow" || !flowProjectId.trim()}
              onClick={() => saveEnv("flow", { FLOW_PROJECT_ID: flowProjectId.trim() })}
            >
              <Save size={13} /> {savingKey === "flow" ? "Menyimpan..." : "Simpan Project ID"}
            </button>
          </div>
          {integ?.flow?.hint && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Status: <strong>{integ.flow.plan || "—"}</strong> · {integ.flow.hint}
            </div>
          )}
        </div>

        <div className="card-subtle" style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: 2, color: "#60a5fa" }} />
          <div>
            <strong>Fungsi &amp; Cara Sync Google Flow:</strong>
            <ol style={{ marginLeft: 16, marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
              <li>Klik <strong>Buka Chrome Flow / Sync</strong> — jika Chrome Flow belum berjalan, browser khusus <code>~/.flow-mcp/chrome-profile</code> akan terbuka otomatis (tidak mengganggu Chrome harianmu).</li>
              <li>Login dengan akun Google AI Pro milikmu di jendela Chrome tersebut (cukup sekali; sesi tersimpan permanen).</li>
              <li>Buka project Flow (atau biarkan Project ID default di atas), lalu klik <strong>Buka Chrome Flow / Sync</strong> sekali lagi untuk menyinkronkan sisa kredit ke sidebar &amp; mengaktifkan Auto-Generate Visuals.</li>
            </ol>
          </div>
        </div>
      </div>

      {/* 2. ElevenLabs Section */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="space-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="row">
            <Mic size={21} color="#a78bfa" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>ElevenLabs (Voice-Over &amp; Native Word Timestamps)</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                API Key disimpan lokal di <code>ai-vid-gen/.env</code> · Otomatis menampilkan sisa kredit di sidebar.
              </div>
            </div>
          </div>
          {integ?.elevenlabs?.ok ? (
            <span className="badge badge-green">
              <CheckCircle2 size={12} /> Connected ({integ.elevenlabs.tier}) · {integ.elevenlabs.remaining?.toLocaleString()} /{" "}
              {integ.elevenlabs.limit?.toLocaleString()} cr
            </span>
          ) : integ?.elevenlabs?.configured ? (
            <span className="badge badge-amber">Key Error</span>
          ) : (
            <span className="badge badge-slate">Not Connected</span>
          )}
        </div>

        <div className="card-subtle" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div className="grid-2">
            <div className="field">
              <label>
                ELEVENLABS_API_KEY{" "}
                {integ?.elevenlabs?.maskedKey && (
                  <span style={{ color: "var(--green)", fontWeight: 600 }}>({integ.elevenlabs.maskedKey})</span>
                )}
              </label>
              <input
                type="password"
                value={elKeyInput}
                onChange={(e) => setElKeyInput(e.target.value)}
                placeholder={integ?.elevenlabs?.configured ? "Kosongkan jika tidak ingin ganti key..." : "sk_..."}
              />
            </div>
            <div className="field">
              <label>Default Voice (ELEVENLABS_VOICE_ID)</label>
              <select value={elVoiceInput} onChange={(e) => setElVoiceInput(e.target.value)}>
                {PREMADE_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-between" style={{ alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <div style={{ fontSize: 12, color: integ?.elevenlabs?.error ? "#fca5a5" : "var(--muted)" }}>
              {integ?.elevenlabs?.error
                ? `Error: ${integ.elevenlabs.error}`
                : integ?.elevenlabs?.nextReset
                ? `Reset kuota berikutnya: ${new Date(integ.elevenlabs.nextReset).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}`
                : "Masukkan API key lalu klik Simpan & Test."}
            </div>
            <button
              className="btn btn-primary btn-sm"
              disabled={savingKey === "elevenlabs"}
              onClick={() => {
                const payload = { ELEVENLABS_VOICE_ID: elVoiceInput };
                if (elKeyInput.trim()) payload.ELEVENLABS_API_KEY = elKeyInput.trim();
                saveEnv("elevenlabs", payload);
              }}
            >
              <KeyRound size={13} /> {savingKey === "elevenlabs" ? "Menyimpan..." : "Simpan & Test ElevenLabs"}
            </button>
          </div>
        </div>

        <div className="card-subtle" style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: 2, color: "#a78bfa" }} />
          <div>
            <strong>Fungsi &amp; Cara Sync ElevenLabs:</strong>
            <ul style={{ marginLeft: 16, marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
              <li>Buka <strong>elevenlabs.io → Profile → API Keys → Create Key</strong> (pastikan izin <em>Text to Speech</em> dan <em>User Read</em> aktif agar counter sisa kredit terbaca).</li>
              <li>Paste key di kolom atas lalu klik <strong>Simpan &amp; Test ElevenLabs</strong> — langsung tersimpan ke <code>.env</code> dan aktif tanpa restart server.</li>
              <li><strong>Catatan Free Plan:</strong> Akun Free hanya bisa memakai <strong>Premade Voice</strong> (Roger, George, Sarah) via API. Untuk memakai Voice Library komunitas (seperti <em>Andi</em>) via API, perlu upgrade ke paket Starter ($5/bln).</li>
            </ul>
          </div>
        </div>
      </div>

      {/* 3. AI Text & Free TTS Providers (Gemini, Groq, Antigravity) */}
      <div className="card" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div className="space-between" style={{ flexWrap: "wrap", gap: 10 }}>
          <div className="row">
            <Cpu size={21} color="#34d399" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>AI Text &amp; Free TTS Providers (Gemini, Groq, Antigravity)</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Dipakai untuk generate ide topik, script episode, polish metadata YouTube, dan <strong>VO Free Tier (Gemini TTS)</strong>.
              </div>
            </div>
          </div>
          {loadingInteg && <span className="badge badge-slate">Memuat...</span>}
        </div>

        <div className="grid-2">
          <div className="card-subtle" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="space-between">
              <strong>Gemini API (Google AI Studio)</strong>
              <span className={`badge ${integ?.aiProviders?.gemini?.configured ? "badge-green" : "badge-slate"}`}>
                {integ?.aiProviders?.gemini?.configured ? `Active (${integ.aiProviders.gemini.maskedKey})` : "Not Set"}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
              Wajib jika memakai <strong>VO Free — Gemini TTS</strong> (0 kredit ElevenLabs) atau fallback script generator.
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input
                type="password"
                style={{ flex: 1 }}
                value={geminiKeyInput}
                onChange={(e) => setGeminiKeyInput(e.target.value)}
                placeholder="AIza..."
              />
              <button
                className="btn btn-sm"
                disabled={savingKey === "gemini" || !geminiKeyInput.trim()}
                onClick={() => saveEnv("gemini", { GEMINI_API_KEY: geminiKeyInput.trim() })}
              >
                <Save size={12} /> Simpan
              </button>
            </div>
          </div>

          <div className="card-subtle" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="space-between">
              <strong>Groq API (Fast Free Text LLM)</strong>
              <span className={`badge ${integ?.aiProviders?.groq?.configured ? "badge-green" : "badge-slate"}`}>
                {integ?.aiProviders?.groq?.configured ? `Active (${integ.aiProviders.groq.maskedKey})` : "Not Set"}
              </span>
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)" }}>
              Fallback gratis &amp; cepat untuk generate topik, script JSON, dan polish judul/deskripsi YouTube.
            </div>
            <div className="row" style={{ gap: 6 }}>
              <input
                type="password"
                style={{ flex: 1 }}
                value={groqKeyInput}
                onChange={(e) => setGroqKeyInput(e.target.value)}
                placeholder="gsk_..."
              />
              <button
                className="btn btn-sm"
                disabled={savingKey === "groq" || !groqKeyInput.trim()}
                onClick={() => saveEnv("groq", { GROQ_API_KEY: groqKeyInput.trim() })}
              >
                <Save size={12} /> Simpan
              </button>
            </div>
          </div>
        </div>

        <div className="card-subtle" style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 8, alignItems: "flex-start" }}>
          <Info size={15} style={{ flexShrink: 0, marginTop: 2, color: "#34d399" }} />
          <div>
            <strong>Cara mendapatkan API Key:</strong> Gemini Key dari <strong>aistudio.google.com/apikey</strong> · Groq Key (gratis) dari <strong>console.groq.com/keys</strong>. Antigravity CLI lokal (<code>AGY_BIN</code>) otomatis dipakai sebagai prioritas pertama untuk generate teks tanpa perlu API key.
          </div>
        </div>
      </div>

      {/* 4. YouTube Section */}
      <div className="card">
        <div className="space-between" style={{ marginBottom: 16, flexWrap: "wrap", gap: 10 }}>
          <div className="row">
            <Youtube size={22} color="#ef4444" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>YouTube Channels (Publish &amp; Schedule)</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                OAuth 2.0 via Google Data API v3 · Token disimpan lokal di <code>dashboard/data/accounts.json</code>
              </div>
            </div>
          </div>
          <a href="/api/youtube/auth" className="btn btn-primary" style={{ textDecoration: "none" }}>
            <Plus size={15} /> Connect YouTube Channel
          </a>
        </div>

        {youtubeList.length === 0 ? (
          <div className="card-subtle" style={{ textAlign: "center", padding: 28, color: "var(--muted)" }}>
            Belum ada channel YouTube terhubung. Klik <strong>Connect YouTube Channel</strong> untuk login.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {youtubeList.map((ch) => (
              <div
                key={ch.id}
                className="card-subtle space-between"
                style={{
                  borderColor: ch.isDefault ? "rgba(59,130,246,0.45)" : undefined,
                }}
              >
                <div className="row" style={{ gap: 12 }}>
                  {ch.thumbnail ? (
                    <img
                      src={ch.thumbnail}
                      alt={ch.title}
                      style={{ width: 42, height: 42, borderRadius: "50%", objectFit: "cover" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        background: "#1e293b",
                        display: "grid",
                        placeItems: "center",
                        fontWeight: 700,
                      }}
                    >
                      {ch.title?.[0] || "Y"}
                    </div>
                  )}
                  <div>
                    <div className="row" style={{ gap: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14.5 }}>{ch.title}</span>
                      {ch.isDefault && (
                        <span className="badge badge-blue">
                          <CheckCircle2 size={12} /> Default
                        </span>
                      )}
                      {ch.hasRefreshToken && <span className="badge badge-green">Auto-Refresh OK</span>}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                      {ch.customUrl ? `${ch.customUrl} · ` : ""}
                      ID: <code>{ch.id}</code>
                    </div>
                  </div>
                </div>

                <div className="row">
                  {!ch.isDefault && (
                    <button className="btn btn-sm" onClick={() => handleSetDefault(ch.id)}>
                      <Star size={13} /> Set Default
                    </button>
                  )}
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDisconnect(ch.id, ch.title)}
                  >
                    <Trash2 size={13} /> Disconnect
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 5. Facebook Reels Section (Phase 2 ready) */}
      <div className="card" style={{ opacity: 0.85 }}>
        <div className="space-between">
          <div className="row">
            <Share2 size={20} color="#60a5fa" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Facebook Pages / Reels (Meta Graph API)</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Phase 2 — distribusi native Long-Form &amp; Reels 9:16 tanpa watermark ke Facebook Page sesuai Playbook Sains 60 Detik.
              </div>
            </div>
          </div>
          <span className="badge badge-slate">Phase 2</span>
        </div>
      </div>
    </div>
  );
}
