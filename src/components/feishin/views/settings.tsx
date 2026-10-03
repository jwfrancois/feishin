"use client";
// Feishin rebuild — settings route (general/playback/servers/hotkeys — working controls)
import { useState } from "react";
import { cn } from "@/lib/utils";
import { THEMES, DEFAULT_THEME } from "@/lib/themes";
import { useSettingsStore } from "@/store/settings-store";
import { useAuthStore, type ServerType } from "@/store/auth-store";
import { usePlayerStore } from "@/store/player-store";
import { useRouterStore } from "@/store/router-store";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { ItemImage } from "../shared";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { DialogNS as Dialog } from "@/components/ui/dialog";

const SECTIONS = [
  { id: "general", label: "General" },
  { id: "playback", label: "Playback" },
  { id: "servers", label: "Servers" },
  { id: "hotkeys", label: "Hotkeys" },
] as const;

function Row({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b border-[var(--border)]/50 py-3.5">
      <div className="min-w-0">
        <div className="text-[13.5px] font-semibold text-[var(--fg)]">{title}</div>
        {description && <div className="text-[12.5px] text-[var(--fg-dim)]">{description}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function GeneralSection() {
  const { theme, setTheme, accent, setAccent, general, setGeneral, sidebar, setSidebar } = useSettingsStore();
  const ACCENTS = ["#3774fc", "#e03131", "#12b886", "#f08c00", "#9333ea", "#e64980", "#0ca678", "#f59f00"];

  return (
    <div>
      <h3 className="mb-2 mt-4 text-[15px] font-bold text-[var(--fg)]">Theme</h3>
      <Row title="Theme" description="Sets the overall look and feel of the application">
        <select
          value={theme}
          onChange={(e) => {
            setTheme(e.target.value);
            toast(`Theme: ${THEMES.find((t) => t.id === e.target.value)?.label}`);
          }}
          className="fs-input h-9 px-2 text-[13px]"
          aria-label="Theme"
        >
          {THEMES.map((t) => (
            <option key={t.id} value={t.id} className="bg-[var(--elevated)]">
              {t.label}
            </option>
          ))}
        </select>
      </Row>
      <Row title="Accent color" description="Overrides the theme accent color">
        <div className="flex items-center gap-1.5">
          {ACCENTS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Accent ${c}`}
              onClick={() => setAccent(c === accent ? null : c)}
              className={cn(
                "h-6 w-6 rounded-full border-2 transition-transform hover:scale-110",
                accent === c ? "border-[var(--fg)]" : "border-transparent",
              )}
              style={{ background: c }}
            />
          ))}
          <button
            type="button"
            onClick={() => setAccent(null)}
            className={cn("fs-icon-btn ml-1 rounded-[4px] px-2 py-1 text-[11px] font-bold", !accent && "bg-[var(--elevated)] text-[var(--primary)]")}
          >
            Default
          </button>
        </div>
      </Row>
      <h3 className="mb-2 mt-6 text-[15px] font-bold text-[var(--fg)]">Sidebar</h3>
      <Row title="Sidebar now playing image" description="Display the current song's cover art in the sidebar">
        <Switch checked={sidebar.image} onCheckedChange={(v) => setSidebar({ image: v })} />
      </Row>
      <Row title="Playlists list" description="Show saved playlists in the sidebar">
        <Switch checked={general.sidebarPlaylistList} onCheckedChange={(v) => setGeneral({ sidebarPlaylistList: v })} />
      </Row>
      <h3 className="mb-2 mt-6 text-[15px] font-bold text-[var(--fg)]">Behavior</h3>
      <Row title="Show ratings" description="Display star ratings on songs and albums">
        <Switch checked={general.showRatings} onCheckedChange={(v) => setGeneral({ showRatings: v })} />
      </Row>
      <Row title="Scrobble playback" description="Send playback information to your server">
        <Switch
          checked={useSettingsStore.getState().playback.scrobble}
          onCheckedChange={(v) => useSettingsStore.getState().setPlayback({ scrobble: v })}
        />
      </Row>
    </div>
  );
}

function PlaybackSection() {
  const playback = useSettingsStore((s) => s.playback);
  const setPlayback = useSettingsStore((s) => s.setPlayback);
  const volume = usePlayerStore((s) => s.volume);
  const setVolume = usePlayerStore((s) => s.setVolume);

  return (
    <div>
      <h3 className="mb-2 mt-4 text-[15px] font-bold text-[var(--fg)]">Playback</h3>
      <Row title="Audio player backend" description="Web player uses the browser's audio engine">
        <select className="fs-input h-9 px-2 text-[13px]" defaultValue="web" aria-label="Player backend">
          <option value="web" className="bg-[var(--elevated)]">Web player</option>
          <option value="mpv" disabled className="bg-[var(--elevated)]">MPV (desktop only)</option>
        </select>
      </Row>
      <Row title="Gapless playback" description="Play consecutive tracks without silence between them">
        <Switch checked={playback.gapless} onCheckedChange={(v) => setPlayback({ gapless: v })} />
      </Row>
      <Row title="Scrobble to server" description="Send playback history to your music server">
        <Switch checked={playback.scrobble} onCheckedChange={(v) => setPlayback({ scrobble: v })} />
      </Row>
      <Row title="Crossfade" description={`Duration of crossfade between tracks (${playback.crossfade}s)`}>
        <div className="w-40">
          <Slider
            value={[playback.crossfade]}
            min={0}
            max={15}
            step={1}
            onValueChange={([v]) => setPlayback({ crossfade: v })}
          />
        </div>
      </Row>
      <Row title="Volume wheel step" description={`Percentage of volume adjusted per scroll (${playback.volumeWheelStep}%)`}>
        <div className="w-40">
          <Slider
            value={[playback.volumeWheelStep]}
            min={1}
            max={25}
            step={1}
            onValueChange={([v]) => setPlayback({ volumeWheelStep: v })}
          />
        </div>
      </Row>
      <Row title="Default volume" description={`Player volume (${Math.round(volume * 100)}%)`}>
        <div className="w-40">
          <Slider
            value={[Math.round(volume * 100)]}
            min={0}
            max={100}
            step={1}
            onValueChange={([v]) => setVolume(v / 100)}
          />
        </div>
      </Row>
    </div>
  );
}

function ServersSection() {
  const servers = useAuthStore((s) => s.servers);
  const currentServerId = useAuthStore((s) => s.currentServerId);
  const serverInfo = useAuthStore((s) => s.serverInfo);
  const setCurrent = useAuthStore((s) => s.setCurrentServer);
  const remove = useAuthStore((s) => s.removeServer);
  const addServer = useAuthStore((s) => s.addServer);
  const setStatus = useAuthStore((s) => s.setStatus);
  const navigate = useRouterStore((s) => s.navigate);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState({ name: "", url: "", username: "", password: "", apiKey: "", type: "jellyfin" as ServerType });
  const [busy, setBusy] = useState(false);

  const addNew = async () => {
    if (form.type !== "jellyfin") {
      toast.error("This build connects to Jellyfin servers only");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/jf/__configure", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url: form.url.trim().replace(/\/+$/, ""),
          username: form.username.trim(),
          password: form.password,
          apiKey: form.apiKey.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error(`Proxy ${res.status}`);
      const info = (await res.json()) as { serverName?: string };
      const server = addServer({
        name: form.name.trim() || info.serverName || "Jellyfin server",
        type: "jellyfin",
        url: form.url.trim().replace(/\/+$/, ""),
        username: form.username.trim(),
      });
      setStatus("connected", { name: info.serverName ?? server.name, version: "" });
      setCurrent(server.id);
      toast(`Connected to "${info.serverName ?? server.name}"`);
      setForm({ name: "", url: "", username: "", password: "", apiKey: "", type: "jellyfin" });
      setAddOpen(false);
      setTimeout(() => window.location.reload(), 400);
    } catch (err) {
      toast.error(err instanceof Error ? `Connection failed: ${err.message}` : "Connection failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-3 mt-4 flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-[var(--fg)]">Servers</h3>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus size={14} />
          Add server
        </Button>
      </div>
      {servers.map((s) => (
        <div key={s.id} className="flex items-center justify-between gap-4 border-b border-[var(--border)]/50 py-3">
          <button type="button" className="flex min-w-0 items-center gap-3 text-left" onClick={() => setCurrent(s.id)}>
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                s.id === currentServerId ? "bg-[var(--primary)]" : "bg-[var(--elevated)]",
              )}
            >
              <span className={cn("text-[11px] font-bold uppercase", s.id === currentServerId ? "text-[var(--primary-contrast)]" : "text-[var(--fg-dim)]")}>
                {s.type.slice(0, 2)}
              </span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-[13.5px] font-semibold text-[var(--fg)]">
                {s.name} {s.id === currentServerId && <span className="text-[var(--primary)]">· active</span>}
              </div>
              <div className="truncate text-[12.5px] text-[var(--fg-dim)]">
                {s.type} · {s.url} · {s.username}
                {s.id === currentServerId && serverInfo?.version ? ` · v${serverInfo.version}` : ""}
              </div>
            </div>
          </button>
          <button
            type="button"
            aria-label={`Remove ${s.name}`}
            onClick={() => {
              remove(s.id);
              toast(`Removed server "${s.name}"`);
            }}
            className="fs-icon-btn p-2 text-[var(--fg-dim)] hover:text-[var(--destructive)]"
          >
            <Trash2 size={15} />
          </button>
        </div>
      ))}
      {servers.length === 0 && (
        <div className="py-8 text-center text-[13px] text-[var(--fg-dim)]">
          No servers configured.{" "}
          <button type="button" className="text-[var(--primary)] hover:underline" onClick={() => navigate({ view: "settings", section: "servers" })}>
            Add one
          </button>{" "}
          to get started.
        </div>
      )}

      <Dialog.Root open={addOpen} onOpenChange={setAddOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[440px] -translate-x-1/2 -translate-y-1/2 rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-5 shadow-2xl focus:outline-none">
            <Dialog.Title className="mb-4 text-lg font-extrabold text-[var(--fg)]">Add server</Dialog.Title>
            <Dialog.Description className="sr-only">Enter server details</Dialog.Description>
            <div className="flex flex-col gap-3">
              <select
                value={form.type}
                onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as ServerType }))}
                className="fs-input h-9 px-2 text-[13px]"
                aria-label="Server type"
              >
                <option value="jellyfin" className="bg-[var(--elevated)]">Jellyfin</option>
                <option value="navidrome" className="bg-[var(--elevated)]">Navidrome</option>
                <option value="subsonic" className="bg-[var(--elevated)]">OpenSubsonic</option>
              </select>
              <input
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Server name"
                className="fs-input h-9 px-3 text-[13px]"
              />
              <input
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://jellyfin.my-server.com"
                className="fs-input h-9 px-3 text-[13px]"
              />
              <input
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                placeholder="Username"
                className="fs-input h-9 px-3 text-[13px]"
              />
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="Password"
                className="fs-input h-9 px-3 text-[13px]"
              />
              <input
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder="API key (optional)"
                className="fs-input h-9 px-3 text-[13px]"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button size="sm" disabled={busy || !form.url.trim() || !form.username.trim()} onClick={() => void addNew()}>
                {busy ? "Connecting…" : "Connect"}
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function HotkeysSection() {
  const keys: [string, string][] = [
    ["Space", "Play / Pause"],
    ["← / →", "Seek backward / forward 5s"],
    ["Ctrl + ← / →", "Previous / next track"],
    ["↑ / ↓", "Volume up / down"],
    ["M", "Mute"],
    ["S", "Toggle shuffle"],
    ["R", "Cycle repeat mode"],
    ["Q", "Toggle play queue"],
    ["F", "Toggle full screen player"],
    ["/", "Focus search"],
    ["Esc", "Close full screen player"],
  ];
  return (
    <div className="mt-4">
      {keys.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between border-b border-[var(--border)]/50 py-3">
          <span className="text-[13.5px] text-[var(--fg)]">{v}</span>
          <kbd className="rounded-[4px] bg-[var(--elevated)] px-2 py-1 font-mono text-[12px] text-[var(--fg-dim)]">{k}</kbd>
        </div>
      ))}
    </div>
  );
}

export function SettingsView({ section = "general" }: { section?: string }) {
  const [active, setActive] = useState(section);
  const theme = useSettingsStore((s) => s.theme);
  const accent = useSettingsStore((s) => s.accent);
  const serverInfo = useAuthStore((s) => s.serverInfo);

  // apply theme live (also applied on mount in app root)
  const themeDef = THEMES.find((t) => t.id === theme) ?? THEMES[0];

  return (
    <div className="px-8 pb-24 pt-8" data-testid="settings-view">
      <h1 className="mb-6 text-2xl font-black tracking-tight text-[var(--fg)]">Settings</h1>
      <div className="flex gap-8">
        <div className="w-44 shrink-0">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setActive(s.id)}
              className={cn(
                "block w-full rounded-[4px] px-3 py-2 text-left text-[13.5px] font-medium transition-colors",
                active === s.id ? "bg-[var(--elevated)] text-[var(--primary)]" : "text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]",
              )}
            >
              {s.label}
            </button>
          ))}
          <div className="mt-6 rounded-[4px] bg-[var(--elevated)] p-3 text-[12px] text-[var(--fg-dim)]">
            <div className="mb-1 font-bold text-[var(--fg)]">Feishin</div>
            Web client · {serverInfo?.name ?? "Jellyfin"}
            {serverInfo?.version ? ` · v${serverInfo.version}` : ""}
            <div className="mt-1">
              Theme: {themeDef.label}
              {accent ? ` · accent ${accent}` : ""}
            </div>
          </div>
        </div>
        <div className="min-w-0 max-w-2xl flex-1">
          {active === "general" && <GeneralSection />}
          {active === "playback" && <PlaybackSection />}
          {active === "servers" && <ServersSection />}
          {active === "hotkeys" && <HotkeysSection />}
        </div>
      </div>
    </div>
  );
}
