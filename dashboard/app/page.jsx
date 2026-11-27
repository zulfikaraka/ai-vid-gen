"use client";

import { useState, useEffect, useCallback } from "react";
import { Clapperboard, Film, CalendarDays, UserCircle2, RefreshCw, Coins } from "lucide-react";
import CreateVideoView from "@/components/CreateVideoView";
import VideosView from "@/components/VideosView";
import CalendarView from "@/components/CalendarView";
import AccountView from "@/components/AccountView";

const NAV_ITEMS = [
  { id: "create", label: "Create Video", icon: Clapperboard },
  { id: "videos", label: "Videos/Shorts", icon: Film },
  { id: "calendar", label: "Calendar", icon: CalendarDays },
  { id: "account", label: "Account", icon: UserCircle2 },
];

export default function DashboardPage() {
  const [menu, setMenu] = useState("videos");
  const [episodes, setEpisodes] = useState([]);
  const [accounts, setAccounts] = useState({ youtube: [], facebook: [] });
  const [credits, setCredits] = useState({ elevenlabs: null, flow: null });
  const [syncingCredits, setSyncingCredits] = useState(false);
  const [syncingFlow, setSyncingFlow] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState("");

  const showToast = useCallback((msg) => {
    setToast(msg);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  const loadCredits = useCallback(async (refreshFlow = false) => {
    if (refreshFlow) setSyncingFlow(true);
    else setSyncingCredits(true);
    try {
      const res = await fetch(refreshFlow ? "/api/credits?refreshFlow=1" : "/api/credits");
      const data = await res.json();
      setCredits((prev) => ({
        elevenlabs: data.elevenlabs ?? prev.elevenlabs,
        flow: data.flow ?? prev.flow,
      }));
      if (refreshFlow) {
        if (data.flow?.signedIn && data.flow?.credits != null) {
          showToast(`✅ Sisa kredit Flow: ${data.flow.credits} (${data.flow.plan || "active"})`);
        } else if (data.flow?.hint || data.flow?.error) {
          showToast(`⚠️ Flow: ${data.flow.hint || data.flow.error}`);
        }
      }
    } catch {
      // ignore transient error
    } finally {
      setSyncingCredits(false);
      setSyncingFlow(false);
    }
  }, [showToast]);

  const loadAll = useCallback(async () => {
    try {
      const [epRes, accRes] = await Promise.all([
        fetch("/api/episodes"),
        fetch("/api/accounts"),
      ]);
      const epData = await epRes.json();
      const accData = await accRes.json();
      setEpisodes(epData.episodes || []);
      setAccounts(accData.accounts || { youtube: [], facebook: [] });
      loadCredits(false);
    } catch (err) {
      showToast(`❌ Gagal memuat data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [showToast, loadCredits]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Handle OAuth callback query params (?menu=account&connected=...)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const qMenu = sp.get("menu");
    const connected = sp.get("connected");
    const err = sp.get("error");
    if (qMenu && ["create", "videos", "calendar", "account"].includes(qMenu)) {
      setMenu(qMenu);
    }
    if (connected) {
      showToast(`✅ Channel YouTube "${connected}" berhasil terhubung!`);
      window.history.replaceState({}, "", "/");
    } else if (err) {
      showToast(`❌ OAuth gagal: ${err}`);
      window.history.replaceState({}, "", "/");
    }
  }, [showToast]);

  const defaultChannel = accounts.youtube?.find((c) => c.isDefault) || accounts.youtube?.[0];

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">AI</div>
          <div>
            <div className="brand-title">AI Vid Gen</div>
            <div className="brand-sub">Studio Dashboard</div>
          </div>
        </div>

        <nav className="nav-list">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={`nav-item ${menu === item.id ? "active" : ""}`}
                onClick={() => setMenu(item.id)}
              >
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div
          className="card-subtle"
          style={{
            marginTop: "auto",
            marginBottom: 10,
            padding: 10,
            fontSize: 11.5,
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div className="space-between" style={{ alignItems: "center" }}>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontWeight: 700, color: "var(--text)" }}>
              <Coins size={13} /> Sisa Kredit
            </span>
            <button
              className="btn btn-sm"
              style={{ padding: "2px 6px", fontSize: 10.5 }}
              onClick={() => loadCredits(false)}
              disabled={syncingCredits}
              title="Refresh kredit ElevenLabs"
            >
              <RefreshCw size={11} />
            </button>
          </div>

          {/* ElevenLabs */}
          <div>
            <div className="space-between" style={{ marginBottom: 3 }}>
              <span style={{ color: "var(--muted)" }}>
                ElevenLabs {credits.elevenlabs?.tier ? `(${credits.elevenlabs.tier})` : ""}
              </span>
              <strong style={{ color: "var(--text)" }}>
                {credits.elevenlabs?.ok
                  ? credits.elevenlabs.remaining.toLocaleString()
                  : credits.elevenlabs?.configured === false
                  ? "No key"
                  : "..."}
              </strong>
            </div>
            {credits.elevenlabs?.ok && credits.elevenlabs.limit > 0 && (() => {
              const pct = Math.max(0, Math.min(100, (credits.elevenlabs.remaining / credits.elevenlabs.limit) * 100));
              const barColor = pct < 15 ? "#ef4444" : pct < 35 ? "#f59e0b" : "#22c55e";
              return (
                <>
                  <div style={{ height: 5, background: "rgba(255,255,255,0.08)", borderRadius: 99, overflow: "hidden" }}>
                    <div style={{ width: `${pct}%`, height: "100%", background: barColor, borderRadius: 99 }} />
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 2 }}>
                    {credits.elevenlabs.remaining.toLocaleString()} / {credits.elevenlabs.limit.toLocaleString()} cr
                    {credits.elevenlabs.nextReset
                      ? ` · reset ${new Date(credits.elevenlabs.nextReset).toLocaleDateString("id-ID", { day: "numeric", month: "short" })}`
                      : ""}
                  </div>
                </>
              );
            })()}
          </div>

          {/* Google Flow */}
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
            <div className="space-between" style={{ alignItems: "center", marginBottom: 3 }}>
              <span style={{ color: "var(--muted)" }}>
                Google Flow {credits.flow?.plan ? `(${credits.flow.plan})` : ""}
              </span>
              {credits.flow?.credits != null ? (
                <strong style={{ color: "var(--text)" }}>{Number(credits.flow.credits).toLocaleString()} cr</strong>
              ) : (
                <span style={{ color: "var(--muted)" }}>—</span>
              )}
            </div>
            <div className="space-between" style={{ alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>
                {credits.flow?.signedIn
                  ? "Terhubung"
                  : credits.flow?.busy
                  ? "Sedang generate..."
                  : "Belum disinkronkan"}
              </span>
              <button
                className="btn btn-sm"
                style={{ padding: "2px 7px", fontSize: 10.5 }}
                onClick={() => loadCredits(true)}
                disabled={syncingFlow}
                title="Cek sisa kredit dari Chrome Google Flow"
              >
                {syncingFlow ? "Sync..." : "Sync Flow"}
              </button>
            </div>
          </div>
        </div>

        <div className="sidebar-footer" style={{ marginTop: 0 }}>
          <div style={{ fontWeight: 600, color: "var(--text)", marginBottom: 2 }}>
            {defaultChannel ? defaultChannel.title : "Belum ada channel"}
          </div>
          <div>{episodes.length} episode lokal tersinkron</div>
        </div>
      </aside>

      <main className="main">
        {loading ? (
          <div className="card" style={{ padding: 40, textAlign: "center", color: "var(--muted)" }}>
            Memuat data episode &amp; channel...
          </div>
        ) : menu === "create" ? (
          <CreateVideoView
            episodes={episodes}
            onRefresh={loadAll}
            onToast={showToast}
            onGoVideos={() => setMenu("videos")}
          />
        ) : menu === "videos" ? (
          <VideosView
            episodes={episodes}
            accounts={accounts}
            onRefresh={loadAll}
            onToast={showToast}
          />
        ) : menu === "calendar" ? (
          <CalendarView
            episodes={episodes}
            onGoVideos={() => setMenu("videos")}
          />
        ) : (
          <AccountView accounts={accounts} onRefresh={loadAll} onToast={showToast} />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
