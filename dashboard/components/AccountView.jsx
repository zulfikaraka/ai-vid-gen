"use client";

import { Youtube, Plus, Star, Trash2, CheckCircle2, Share2 } from "lucide-react";

export default function AccountView({ accounts, onRefresh, onToast }) {
  const youtubeList = accounts?.youtube || [];

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
          <h1 className="page-title">Account & Connected Channels</h1>
          <p className="page-sub">
            Hubungkan satu atau lebih channel YouTube (dan platform lain) untuk multi-channel upload.
          </p>
        </div>
      </div>

      {/* YouTube Section */}
      <div className="card">
        <div className="space-between" style={{ marginBottom: 16 }}>
          <div className="row">
            <Youtube size={22} color="#ef4444" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>YouTube Channels</div>
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

      {/* Facebook Reels Section (Phase 2 ready) */}
      <div className="card" style={{ opacity: 0.85 }}>
        <div className="space-between">
          <div className="row">
            <Share2 size={20} color="#60a5fa" />
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Facebook Pages / Reels</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>
                Siap untuk Phase 2 — multi-platform publish Shorts/Reels 9:16 ke Facebook Pro.
              </div>
            </div>
          </div>
          <span className="badge badge-slate">Coming in Phase 2</span>
        </div>
      </div>
    </div>
  );
}
