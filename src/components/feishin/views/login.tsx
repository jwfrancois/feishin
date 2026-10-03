"use client";
// Feishin rebuild — login route (server select + connect, faithful to feishin's auth-layout)
import { useState } from "react";
import { toast } from "sonner";
import { Server, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore, type ServerType } from "@/store/auth-store";
import { ItemImage } from "../shared";

const SERVER_TYPES: { id: ServerType; label: string }[] = [
  { id: "jellyfin", label: "Jellyfin" },
  { id: "navidrome", label: "Navidrome" },
  { id: "subsonic", label: "OpenSubsonic" },
];

export function LoginView() {
  const servers = useAuthStore((s) => s.servers);
  const addServer = useAuthStore((s) => s.addServer);
  const setCurrent = useAuthStore((s) => s.setCurrentServer);
  const currentServerId = useAuthStore((s) => s.currentServerId);

  const [mode, setMode] = useState<"list" | "form">(servers.length ? "list" : "form");
  const [form, setForm] = useState({ name: "", url: "", username: "", password: "", type: "navidrome" as ServerType });
  const [savePassword, setSavePassword] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const connect = (opts?: { id: string }) => {
    setConnecting(true);
    setTimeout(() => {
      setConnecting(false);
      if (opts) {
        setCurrent(opts.id);
      } else {
        const server = addServer({
          name: form.name.trim() || "Navidrome Demo",
          type: form.type,
          url: form.url.trim() || "https://music.example.com",
          username: form.username.trim() || "demo",
          savePassword,
        });
        setCurrent(server.id);
      }
      toast.success("Connected — loading library");
    }, 600);
  };

  return (
    <div className="flex h-screen w-full items-center justify-center bg-[var(--bg)]" data-testid="login-view">
      <div className="absolute inset-0 -z-10 opacity-40" style={{ background: "radial-gradient(80% 60% at 50% 0%, rgba(55,116,252,0.18), transparent)" }} />
      <div className="flex max-h-[92vh] w-[860px] overflow-hidden rounded-[6px] border border-[var(--border)] shadow-2xl">
        {/* left: server list */}
        <div className="flex w-[300px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--bg-alt)]">
          <div className="flex items-center gap-2 px-4 py-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/feishin-icon.png" alt="Feishin" className="h-7 w-7" />
            <span className="text-[15px] font-black tracking-tight text-[var(--fg)]">Feishin</span>
          </div>
          <div className="flex-1 overflow-y-auto px-2 pb-2">
            {servers.map((s) => (
              <div
                key={s.id}
                className={cn(
                  "mb-1 flex cursor-pointer items-center gap-3 rounded-[4px] p-2 transition-colors hover:bg-[var(--hover)]",
                  s.id === currentServerId && "bg-[var(--elevated)]",
                )}
                onClick={() => connect({ id: s.id })}
              >
                <ItemImage className="h-10 w-10" alt={`${s.name} icon`} />
                <div className="min-w-0 leading-tight">
                  <div className="truncate text-[13px] font-bold text-[var(--fg)]">{s.name}</div>
                  <div className="truncate text-[12px] text-[var(--fg-dim)]">
                    {s.type} · {s.username}
                  </div>
                </div>
              </div>
            ))}
            {servers.length === 0 && (
              <div className="px-3 py-6 text-center text-[12.5px] text-[var(--fg-dim)]">
                No servers yet. Add one to get started.
              </div>
            )}
          </div>
          <div className="p-2">
            <button
              type="button"
              onClick={() => setMode("form")}
              className="fs-pill w-full justify-center !py-2 text-[13px]"
            >
              Add server
            </button>
          </div>
        </div>

        {/* right: form */}
        <div className="flex flex-1 flex-col justify-center bg-[var(--bg)] p-8">
          {mode === "list" ? (
            <div className="text-center">
              <Server size={40} className="mx-auto mb-4 text-[var(--fg-dim)]" />
              <h2 className="mb-2 text-xl font-extrabold text-[var(--fg)]">Select a server</h2>
              <p className="mb-6 text-[13px] text-[var(--fg-dim)]">
                Choose a saved server on the left, or add a new connection.
              </p>
              <div className="mx-auto flex max-w-[280px] flex-col gap-2">
                <button type="button" className="fs-pill justify-center" onClick={() => connect()}>
                  Quick connect (demo)
                </button>
                <button
                  type="button"
                  className="fs-pill justify-center"
                  onClick={() => setMode("form")}
                >
                  Open menu
                </button>
              </div>
            </div>
          ) : (
            <div>
              <button
                type="button"
                onClick={() => setMode("list")}
                className="mb-4 flex items-center gap-1 text-[12.5px] text-[var(--fg-dim)] hover:text-[var(--fg)]"
              >
                <ArrowLeft size={14} />
                Back to servers
              </button>
              <h2 className="mb-1 text-xl font-extrabold text-[var(--fg)]">Add server</h2>
              <p className="mb-5 text-[13px] text-[var(--fg-dim)]">
                Enter the full URL to your server, including the protocol and port if applicable.
              </p>
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-1.5">
                  {SERVER_TYPES.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, type: t.id }))}
                      className={cn(
                        "rounded-[4px] border px-2 py-2 text-[12.5px] font-semibold transition-colors",
                        form.type === t.id
                          ? "border-[var(--primary)] bg-[var(--elevated)] text-[var(--primary)]"
                          : "border-[var(--border)] text-[var(--fg-dim)] hover:bg-[var(--hover)] hover:text-[var(--fg)]",
                      )}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Server name (e.g. Navidrome Demo)"
                  className="fs-input h-10 px-3 text-[13.5px]"
                />
                <input
                  value={form.url}
                  onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                  placeholder="https://navidrome.my-server.com or http://192.168.0.1:4533"
                  className="fs-input h-10 px-3 text-[13.5px]"
                />
                <div className="grid grid-cols-2 gap-3">
                  <input
                    value={form.username}
                    onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    placeholder="Username"
                    className="fs-input h-10 px-3 text-[13.5px]"
                  />
                  <input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                    placeholder="Password"
                    className="fs-input h-10 px-3 text-[13.5px]"
                  />
                </div>
                <label className="flex items-center gap-2 text-[13px] text-[var(--fg-dim)]">
                  <input
                    type="checkbox"
                    checked={savePassword}
                    onChange={(e) => setSavePassword(e.target.checked)}
                    className="accent-[var(--primary)]"
                  />
                  Save password
                </label>
                <button
                  type="button"
                  disabled={connecting}
                  onClick={() => connect()}
                  className="fs-pill mt-1 justify-center bg-[var(--primary)] !text-[var(--primary-contrast)] hover:brightness-110"
                >
                  {connecting ? "Connecting…" : "Connect"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
