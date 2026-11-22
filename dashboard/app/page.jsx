"use client";

import { useState, useEffect, useCallback } from "react";
import { Clapperboard, Film, UserCircle2 } from "lucide-react";
import CreateVideoView from "@/components/CreateVideoView";
import VideosView from "@/components/VideosView";
import AccountView from "@/components/AccountView";

const NAV_ITEMS = [
  { id: "create", label: "Create Video", icon: Clapperboard },
  { id: "videos", label: "Videos/Shorts", icon: Film },
  { id: "account", label: "Account", icon: UserCircle2 },
];

export default function DashboardPage() {
  const [menu, setMenu] = useState("videos");
  const [episodes, setEpisodes] = useState([]);
  const [accounts, setAccounts] = useState({ youtube: [], facebook: [] });
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
    } catch (err) {
      showToast(`❌ Gagal memuat data: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

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
    if (qMenu && ["create", "videos", "account"].includes(qMenu)) {
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

        <div className="sidebar-footer">
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
        ) : (
          <AccountView accounts={accounts} onRefresh={loadAll} onToast={showToast} />
        )}
      </main>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
