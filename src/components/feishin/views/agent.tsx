"use client";
// Feishin rebuild — Library Agent dashboard.
// The cloud agent that services the media library: scrapes the internet for
// metadata/art/bios/lyrics and monitors system health. This view is its cockpit.
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  RefreshCw,
  HeartPulse,
  Globe,
  Image as ImageIcon,
  BookOpenText,
  Music4,
  Database,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Pause,
  Play,
  CloudUpload,
  HardDrive,
  Waves,
  Disc3,
  Copy,
  Gauge,
  Rocket,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isWritableKind } from "@/lib/agent/writable-kinds";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";

// ---------------------------------------------------------------- types

interface HealthCheck {
  name: string;
  status: "ok" | "warn" | "fail";
  latencyMs: number;
  detail: string;
  shares?: { path: string; readable: number; total: number }[];
}

interface AgentRunRow {
  id: string;
  jobType: string;
  status: string;
  startedAt: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  processed: number;
  enriched: number;
  missing: number;
  error?: string | null;
  log?: string | null;
}

interface AgentStatus {
  config: {
    enabled: boolean;
    scanIntervalMin: number;
    healthIntervalMin: number;
    batchSize: number;
    writeBack: string;
    sources: Record<string, boolean>;
    fanartApiKey: string;
    lastStage: string;
  };
  runtime: { startedAt: number; booted: boolean; running: string[]; lastTick: number; timerAlive: boolean };
  running: { health: boolean; scan: boolean; audit: boolean; releases: boolean };
  lastHealthRun: AgentRunRow | null;
  lastScanRun: AgentRunRow | null;
  lastAuditRun?: AgentRunRow | null;
  lastReleasesRun?: AgentRunRow | null;
  latestHealth: {
    id: string;
    overall: string;
    score: number;
    checks: HealthCheck[];
    serverName: string;
    serverVersion: string;
    serverLatency: number;
    albumCount: number;
    songCount: number;
    mediaReadable: number;
    cacheMb: number;
    memoryMb: number;
    internetOk: boolean;
  } | null;
  findingCounts: Record<string, Record<string, number>>;
  pendingCount: number;
}

interface FindingRow {
  id: string;
  itemId: string;
  itemType: string;
  itemName: string;
  itemSubtitle: string;
  kind: string;
  source: string;
  status: string;
  summary: string;
  serverStatus: string;
  serverError?: string | null;
  updatedAt: string;
}

interface HistoryPoint {
  id: string;
  overall: string;
  score: number;
  serverLatency: number;
  mediaReadable: number;
  memoryMb: number;
}

const KIND_META: Record<string, { label: string; icon: React.ReactNode }> = {
  artwork: { label: "Artwork", icon: <ImageIcon size={13} /> },
  bio: { label: "Biography", icon: <BookOpenText size={13} /> },
  metadata: { label: "Metadata", icon: <Database size={13} /> },
  lyrics: { label: "Lyrics", icon: <Music4 size={13} /> },
  sound: { label: "Auto-EQ profile", icon: <Waves size={13} /> },
  discography: { label: "Discography", icon: <Disc3 size={13} /> },
  dupes: { label: "Duplicate", icon: <Copy size={13} /> },
  quality: { label: "Low quality", icon: <Gauge size={13} /> },
  releases: { label: "Release radar", icon: <Rocket size={13} /> },
};

const SOURCE_LABELS: Record<string, string> = {
  deezer: "Deezer",
  itunes: "iTunes",
  coverart: "Cover Art Archive",
  musicbrainz: "MusicBrainz",
  wikipedia: "Wikipedia",
  lrclib: "LRCLIB",
  fanart: "Fanart.tv (artist photos)",
  jellyfin: "Your library",
};

// ---------------------------------------------------------------- small pieces

function StatusIcon({ status }: { status: "ok" | "warn" | "fail" | string }) {
  if (status === "ok") return <CheckCircle2 size={15} className="shrink-0 text-emerald-400" />;
  if (status === "warn") return <AlertTriangle size={15} className="shrink-0 text-amber-400" />;
  return <XCircle size={15} className="shrink-0 text-red-400" />;
}

function Pill({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "good" | "warn" | "bad" | "accent" }) {
  const tones = {
    neutral: "bg-[var(--elevated)] text-[var(--fg-dim)]",
    good: "bg-emerald-500/15 text-emerald-400",
    warn: "bg-amber-500/15 text-amber-400",
    bad: "bg-red-500/15 text-red-400",
    accent: "bg-[var(--primary)]/15 text-[var(--primary)]",
  };
  return <span className={cn("rounded-[4px] px-2 py-0.5 text-[11px] font-bold", tones[tone])}>{children}</span>;
}

function StatCard({ label, value, sub, icon }: { label: string; value: React.ReactNode; sub?: string; icon?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-4">
      {icon && <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[6px] bg-[var(--bg)] text-[var(--primary)]">{icon}</div>}
      <div className="min-w-0">
        <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--fg-dim)]">{label}</div>
        <div className="truncate text-[19px] font-black leading-tight text-[var(--fg)]">{value}</div>
        {sub && <div className="truncate text-[11.5px] text-[var(--fg-dim)]">{sub}</div>}
      </div>
    </div>
  );
}

function timeAgo(iso?: string | number | null): string {
  if (!iso) return "never";
  try {
    return formatDistanceToNow(typeof iso === "number" ? new Date(iso) : new Date(iso), { addSuffix: true });
  } catch {
    return "unknown";
  }
}

// ---------------------------------------------------------------- main view

export function AgentView() {
  const [status, setStatus] = useState<AgentStatus | null>(null);
  const [findings, setFindings] = useState<FindingRow[]>([]);
  const [findingsTotal, setFindingsTotal] = useState(0);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [runs, setRuns] = useState<AgentRunRow[]>([]);
  const [kindFilter, setKindFilter] = useState<string>("");
  const [tab, setTab] = useState<"health" | "enrichments" | "activity" | "settings">("health");
  const [busy, setBusy] = useState<string>("");
  const [applying, setApplying] = useState<string>("");
  const [batchBusy, setBatchBusy] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/status", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean } & AgentStatus;
        if (data.ok) setStatus(data);
      }
    } catch {
      /* transient */
    }
  }, []);

  const loadFindings = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ limit: "80" });
      if (kindFilter) qs.set("kind", kindFilter);
      const res = await fetch(`/api/agent/findings?${qs}`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; total: number; items: FindingRow[] };
        if (data.ok) {
          setFindings(data.items);
          setFindingsTotal(data.total);
        }
      }
    } catch {
      /* transient */
    }
  }, [kindFilter]);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/health?history=60", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { ok: boolean; history: HistoryPoint[] };
        if (data.ok) setHistory(data.history);
      }
    } catch {
      /* transient */
    }
  }, []);

  const loadRuns = useCallback(async () => {
    try {
      const res = await fetch("/api/agent/status", { cache: "no-store" });
      void res;
      // runs come from the status endpoint's last* fields; full history via runs query below
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    void loadFindings();
    void loadHistory();
    pollRef.current = setInterval(() => void loadStatus(), 5_000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [loadStatus, loadFindings, loadHistory]);

  useEffect(() => {
    void loadFindings();
  }, [kindFilter, loadFindings]);

  const trigger = async (job: "health" | "scan" | "audit" | "releases") => {
    setBusy(job);
    try {
      const res = await fetch("/api/agent/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ job }) });
      const data = (await res.json()) as { ok: boolean; started?: boolean; error?: string };
      const jobLabels: Record<typeof job, string> = { health: "Health check", scan: "Library scan", audit: "Library audit", releases: "Release radar" };
      if (data.ok) {
        toast(data.started ? `${jobLabels[job]} started` : "Job already running", { duration: 2000 });
        setTimeout(() => {
          void loadStatus();
          void loadFindings();
          void loadHistory();
        }, 1500);
      } else {
        toast.error(data.error ?? "Failed to start job");
      }
    } catch {
      toast.error("Agent unreachable");
    } finally {
      setBusy("");
    }
  };

  const patchConfig = async (patch: Record<string, unknown>) => {
    try {
      const res = await fetch("/api/agent/config", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (res.ok) {
        await loadStatus();
        toast("Agent settings saved", { duration: 1500 });
      } else {
        toast.error("Failed to save settings");
      }
    } catch {
      toast.error("Agent unreachable");
    }
  };

  const applyOne = async (f: FindingRow) => {
    setApplying(f.id);
    try {
      const res = await fetch(`/api/agent/findings/${f.id}/apply`, { method: "POST" });
      const data = (await res.json()) as { ok: boolean; result?: { ok: boolean; detail: string }; error?: string };
      if (data.result?.ok) {
        toast.success(`Written to Jellyfin — ${data.result.detail}`, { duration: 3500 });
      } else {
        toast.error(`${data.result?.detail ?? data.error ?? "Write-back failed"}`, { duration: 4500 });
      }
      await loadFindings();
      await loadStatus();
    } catch {
      toast.error("Agent unreachable");
    } finally {
      setApplying("");
    }
  };

  const applyAll = async () => {
    if (batchBusy) return;
    setBatchBusy(true);
    try {
      const res = await fetch("/api/agent/writeback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: 40 }),
      });
      const data = (await res.json()) as { ok: boolean; started?: boolean; error?: string };
      if (!data.ok) {
        toast.error(data.error ?? "Could not start write-back");
        setBatchBusy(false);
        return;
      }
      toast("Write-back batch started — writing scraped data into Jellyfin…", { duration: 3000 });
      const poll = setInterval(() => {
        void (async () => {
          try {
            const st = await fetch("/api/agent/writeback", { cache: "no-store" });
            const s = (await st.json()) as { ok: boolean; running: boolean };
            if (!s.running) {
              clearInterval(poll);
              setBatchBusy(false);
              await loadFindings();
              await loadStatus();
              toast.success("Write-back batch finished", { duration: 2500 });
            }
          } catch {
            /* keep polling */
          }
        })();
      }, 2_500);
      setTimeout(() => {
        clearInterval(poll);
        setBatchBusy(false);
      }, 240_000);
    } catch {
      toast.error("Agent unreachable");
      setBatchBusy(false);
    }
  };

  if (!status) {
    return (
      <div className="px-8 pb-24 pt-8" data-testid="agent-view-loading">
        <div className="mb-6 h-9 w-56 animate-pulse rounded bg-[var(--elevated)]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-[6px] bg-[var(--elevated)]" />
          ))}
        </div>
      </div>
    );
  }

  const cfg = status.config;
  const health = status.latestHealth;
  const runningNow = status.running.health || status.running.scan || status.running.audit || status.running.releases;
  const foundArtwork = (status.findingCounts.artwork?.found ?? 0) + (status.findingCounts.artwork?.applied ?? 0);
  const foundBios = status.findingCounts.bio?.found ?? 0;
  const foundMeta = status.findingCounts.metadata?.found ?? 0;
  void runs;

  return (
    <div className="px-8 pb-24 pt-8" data-testid="agent-view">
      {/* header */}
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-[8px] bg-[var(--primary)]/15 text-[var(--primary)]">
          <Bot size={24} />
        </div>
        <div className="mr-auto">
          <h1 className="text-[26px] font-black leading-tight text-[var(--fg)]">Library Agent</h1>
          <div className="text-[12.5px] text-[var(--fg-dim)]">
            Autonomous manager — scrapes the internet for library metadata and monitors system health
          </div>
        </div>
        <Pill tone={cfg.enabled ? (runningNow ? "accent" : "good") : "neutral"}>
          {cfg.enabled ? (runningNow ? "Working…" : "Active") : "Paused"}
        </Pill>
        <button
          type="button"
          className="fs-pill"
          onClick={() => patchConfig({ enabled: !cfg.enabled })}
          title={cfg.enabled ? "Pause the agent" : "Resume the agent"}
        >
          {cfg.enabled ? <Pause size={14} /> : <Play size={14} className="fill-current" />}
          {cfg.enabled ? "Pause" : "Resume"}
        </button>
        <button type="button" className="fs-pill" onClick={() => void trigger("health")} disabled={busy !== "" || status.running.health}>
          <RefreshCw size={14} className={cn(status.running.health && "fs-spin")} />
          Health check
        </button>
        <button type="button" className="fs-pill" onClick={() => void trigger("scan")} disabled={busy !== "" || status.running.scan}>
          <RefreshCw size={14} className={cn(status.running.scan && "fs-spin")} />
          Scan library
        </button>
        <button type="button" className="fs-pill" onClick={() => void trigger("audit")} disabled={busy !== "" || status.running.audit} title="Find duplicate tracks and low-bitrate sources">
          <Copy size={14} className={cn(status.running.audit && "fs-spin")} />
          Audit
        </button>
        <button type="button" className="fs-pill" onClick={() => void trigger("releases")} disabled={busy !== "" || status.running.releases} title="Check MusicBrainz for recent releases missing from your library">
          <Rocket size={14} className={cn(status.running.releases && "fs-spin")} />
          Releases
        </button>
      </div>

      {/* stat cards */}
      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label="System health"
          value={health ? health.overall.toUpperCase() : "UNKNOWN"}
          sub={health ? `${health.score}/100 · server ${health.serverLatency} ms · checked ${timeAgo(health.id)}` : "waiting for first check"}
          icon={<HeartPulse size={19} />}
        />
        <StatCard
          label="Internet sources"
          value={health ? (health.internetOk ? "Online" : "Offline") : "—"}
          sub={health ? `${Object.values(cfg.sources).filter(Boolean).length} sources enabled` : undefined}
          icon={<Globe size={19} />}
        />
        <StatCard
          label="Gaps pending"
          value={status.pendingCount.toLocaleString()}
          sub="items the app noticed missing — resolved by the next scan"
          icon={<AlertTriangle size={19} />}
        />
        <StatCard
          label="Enriched items"
          value={(foundArtwork + foundBios + foundMeta + (status.findingCounts.lyrics?.found ?? 0)).toLocaleString()}
          sub={`${foundArtwork} art · ${foundBios} bios · ${foundMeta} metadata`}
          icon={<Database size={19} />}
        />
      </div>

      {/* tabs */}
      <div className="mb-4 flex items-center gap-5 border-b border-[var(--border)]">
        {(["health", "enrichments", "activity", "settings"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "-mb-px border-b-2 pb-2.5 pt-1 text-[12px] font-bold uppercase tracking-[0.08em] transition-colors",
              tab === t ? "border-[var(--primary)] text-[var(--fg)]" : "border-transparent text-[var(--fg-dim)] hover:text-[var(--fg)]",
            )}
          >
            {t}
          </button>
        ))}
        <div className="ml-auto pb-2 text-[11.5px] text-[var(--fg-dim)]">
          last scan {timeAgo(status.lastScanRun?.startedAt)} · last check {timeAgo(status.lastHealthRun?.startedAt)}
        </div>
      </div>

      {/* ------------------------------------------------ health tab */}
      {tab === "health" && (
        <div className="grid gap-4 lg:grid-cols-2" data-testid="agent-health-tab">
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-extrabold text-[var(--fg)]">Latest checks</h3>
              {status.running.health && <Pill tone="accent">running…</Pill>}
            </div>
            {!health && <p className="text-[13px] text-[var(--fg-dim)]">No health snapshot yet — the first check runs right after server boot.</p>}
            {health && (
              <div className="flex flex-col gap-2.5">
                <div className="mb-1 grid grid-cols-3 gap-2 text-[11.5px] text-[var(--fg-dim)]">
                  <span>
                    <b className="text-[var(--fg)]">{health.serverName || "server"}</b> v{health.serverVersion}
                  </span>
                  <span>
                    {health.albumCount.toLocaleString()} albums · {health.songCount.toLocaleString()} songs
                  </span>
                  <span>
                    {Math.round(health.mediaReadable * 100)}% media readable · {health.memoryMb} MB RSS
                  </span>
                </div>
                {health.checks.map((c) => (
                  <div key={c.name} className="flex items-start gap-2.5 rounded-[4px] bg-[var(--bg)] px-3 py-2.5">
                    <div className="pt-0.5">
                      <StatusIcon status={c.status} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="text-[13px] font-bold text-[var(--fg)]">{c.name}</span>
                        {c.latencyMs > 0 && <span className="text-[11px] text-[var(--fg-dim)]">{c.latencyMs} ms</span>}
                      </div>
                      <div className="text-[12px] leading-snug text-[var(--fg-dim)]">{c.detail}</div>
                      {c.name === "Media files" && c.shares && c.shares.length > 0 && (
                        <div className="mt-1.5 flex flex-col gap-1">
                          {c.shares.map((s) => (
                            <div key={s.path} className="flex items-center gap-2 text-[11.5px]">
                              <HardDrive size={11} className="shrink-0 text-[var(--fg-dim)]" />
                              <code className="text-[var(--fg)]">{s.path}</code>
                              <span className="ml-auto whitespace-nowrap text-[var(--fg-dim)]">
                                {s.readable}/{s.total} readable
                              </span>
                            </div>
                          ))}
                          {c.status !== "ok" && (
                            <div className="mt-1 flex items-center gap-2">
                              <button
                                type="button"
                                className="fs-pill !py-1 text-[11px]"
                                onClick={() => void trigger("health")}
                                disabled={busy !== "" || status.running.health}
                                title="Remount the share on your NAS, then re-probe — the score recovers automatically"
                              >
                                <RefreshCw size={11} className={cn(status.running.health && "fs-spin")} />
                                Re-probe after remount
                              </button>
                              <span className="text-[11px] text-[var(--fg-dim)]">remount the share, then the score recovers on the next check</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-4">
            <h3 className="mb-3 text-[14px] font-extrabold text-[var(--fg)]">Score history</h3>
            <ScoreSparkline history={history} />
            <div className="mt-3 text-[11.5px] text-[var(--fg-dim)]">
              Health score over the last {history.length || 0} checks (every {cfg.healthIntervalMin} min). Media readability below 100% usually means a
              media share is unmounted on the server.
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ enrichments tab */}
      {tab === "enrichments" && (
        <div className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-4" data-testid="agent-enrichments-tab">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h3 className="mr-auto text-[14px] font-extrabold text-[var(--fg)]">Scraped knowledge ({findingsTotal.toLocaleString()})</h3>
            <select
              value={kindFilter}
              onChange={(e) => setKindFilter(e.target.value)}
              className="fs-input h-8 w-40 py-0 text-[12.5px]"
              aria-label="Filter by kind"
            >
              <option value="">All kinds</option>
              {Object.entries(KIND_META).map(([k, m]) => (
                <option key={k} value={k}>
                  {m.label}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="fs-pill !py-1.5"
              onClick={() => void applyAll()}
              disabled={batchBusy}
              title="Write every scraped finding (not yet synced) into the Jellyfin server itself"
            >
              <CloudUpload size={13} className={cn(batchBusy && "fs-spin")} />
              {batchBusy ? "Writing…" : "Write all to Jellyfin"}
            </button>
            <button type="button" className="fs-pill !py-1.5" onClick={() => void loadFindings()}>
              <RefreshCw size={13} />
              Refresh
            </button>
          </div>
          {findings.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-[var(--fg-dim)]">
              Nothing scraped yet. Trigger a library scan, or browse albums — the agent notices missing artwork as you browse and fills the gaps.
            </p>
          ) : (
            <div className="max-h-[520px] overflow-y-auto">
              <table className="w-full text-left text-[12.5px]">
                <thead className="sticky top-0 bg-[var(--elevated)] text-[11px] uppercase tracking-[0.06em] text-[var(--fg-dim)]">
                  <tr>
                    <th className="px-2 py-2">Item</th>
                    <th className="px-2 py-2">Kind</th>
                    <th className="px-2 py-2">Source</th>
                    <th className="px-2 py-2">Status</th>
                    <th className="px-2 py-2">Server</th>
                    <th className="px-2 py-2">Detail</th>
                    <th className="px-2 py-2">Updated</th>
                    <th className="px-2 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {findings.map((f) => {
                    const writable = (f.status === "found" || f.status === "applied") && f.serverStatus !== "synced" && isWritableKind(f.kind);
                    return (
                      <tr key={f.id} className="border-t border-[var(--border)]">
                        <td className="max-w-[200px] px-2 py-2">
                          <div className="truncate font-semibold text-[var(--fg)]">{f.itemName || f.itemId}</div>
                          {f.itemSubtitle && <div className="truncate text-[11px] text-[var(--fg-dim)]">{f.itemSubtitle}</div>}
                        </td>
                        <td className="px-2 py-2">
                          <span className="flex items-center gap-1.5 text-[var(--fg-dim)]">
                            {KIND_META[f.kind]?.icon}
                            {KIND_META[f.kind]?.label ?? f.kind}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-[var(--fg-dim)]">{SOURCE_LABELS[f.source] ?? f.source ?? "—"}</td>
                        <td className="px-2 py-2">
                          <Pill tone={f.status === "found" || f.status === "applied" ? "good" : f.status === "pending" ? "warn" : "neutral"}>{f.status}</Pill>
                        </td>
                        <td className="px-2 py-2">
                          <span title={f.serverError ?? undefined}>
                            <Pill tone={f.serverStatus === "synced" ? "good" : f.serverStatus === "failed" ? "bad" : "neutral"}>
                              {f.serverStatus === "synced" ? "on server" : f.serverStatus === "failed" ? "failed" : "in-app"}
                            </Pill>
                          </span>
                        </td>
                        <td className="max-w-[240px] truncate px-2 py-2 text-[var(--fg-dim)]" title={f.summary}>
                          {f.summary || "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-[11.5px] text-[var(--fg-dim)]">{timeAgo(f.updatedAt)}</td>
                        <td className="px-2 py-2 text-right">
                          {writable ? (
                            <button
                              type="button"
                              className="fs-pill !py-1 text-[11px]"
                              onClick={() => void applyOne(f)}
                              disabled={applying !== "" || batchBusy}
                              title="Write this finding into the Jellyfin server (bio → overview, artwork → primary image, metadata → year/genres, lyrics)"
                            >
                              <CloudUpload size={11} className={cn(applying === f.id && "fs-spin")} />
                              {applying === f.id ? "writing" : "write"}
                            </button>
                          ) : f.serverStatus === "synced" ? (
                            <span className="text-[11px] text-emerald-400">✓</span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fg-dim)]">
            <b className="text-[var(--fg)]">Server write-back</b> pushes scraped data into Jellyfin itself (artist bios, album/artist artwork, year &amp;
            genres, lyrics) so every Jellyfin client benefits. Fill-if-missing: the agent never overwrites values the server already has.
          </p>
        </div>
      )}

      {/* ------------------------------------------------ activity tab */}
      {tab === "activity" && (
        <div className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-4" data-testid="agent-activity-tab">
          <div className="mb-3 flex items-center gap-2">
            <h3 className="mr-auto text-[14px] font-extrabold text-[var(--fg)]">Recent runs</h3>
            {status.running.scan && <Pill tone="accent">scan running…</Pill>}
            {status.running.health && <Pill tone="accent">health running…</Pill>}
          </div>
          <div className="flex flex-col gap-2.5">
            {[status.lastHealthRun, status.lastScanRun].filter(Boolean).map((run) => (
              <RunCard key={run!.id} run={run!} />
            ))}
            <p className="mt-2 text-[11.5px] text-[var(--fg-dim)]">
              Runs are scheduled automatically (health every {cfg.healthIntervalMin} min, scans every {cfg.scanIntervalMin} min) and can be triggered
              manually from the header.
            </p>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ settings tab */}
      {tab === "settings" && (
        <div className="grid max-w-3xl gap-4" data-testid="agent-settings-tab">
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[14px] font-extrabold text-[var(--fg)]">Scan frequency &amp; batch size</h3>
              <span className="text-[11px] text-[var(--fg-dim)]">changes apply within ~30 s</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <NumberField
                label="Health interval (min)"
                value={cfg.healthIntervalMin}
                min={1}
                max={1440}
                onCommit={(v) => void patchConfig({ healthIntervalMin: v })}
              />
              <NumberField label="Scan interval (min)" value={cfg.scanIntervalMin} min={1} max={1440} onCommit={(v) => void patchConfig({ scanIntervalMin: v })} />
              <NumberField label="Items per scan" value={cfg.batchSize} min={1} max={100} onCommit={(v) => void patchConfig({ batchSize: v })} />
            </div>
            <div className="mt-4 flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--fg-dim)]">Scan every</span>
                {[10, 15, 30, 45, 60, 120].map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => void patchConfig({ scanIntervalMin: m })}
                    className={cn("fs-pill !py-1 text-[11px]", cfg.scanIntervalMin === m && "!bg-[var(--primary)]/20 !text-[var(--primary)]")}
                  >
                    {m < 60 ? `${m} min` : `${m / 60} h`}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--fg-dim)]">Batch size</span>
                {[8, 16, 32, 64].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => void patchConfig({ batchSize: n })}
                    className={cn("fs-pill !py-1 text-[11px]", cfg.batchSize === n && "!bg-[var(--primary)]/20 !text-[var(--primary)]")}
                  >
                    {n} items
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-4">
            <h3 className="mb-1 text-[14px] font-extrabold text-[var(--fg)]">Jellyfin write-back</h3>
            <p className="mb-3 text-[12px] leading-relaxed text-[var(--fg-dim)]">
              Push scraped data into the Jellyfin server itself — artist bios (overview), album &amp; artist artwork (primary image), album year &amp; genres,
              synced lyrics — so every Jellyfin client benefits, not just this app. Fill-if-missing: existing server values are never overwritten.
            </p>
            <div className="grid grid-cols-3 gap-2">
              {([
                { key: "off", label: "Off", hint: "app-only" },
                { key: "manual", label: "Manual", hint: "buttons in Enrichments" },
                { key: "auto", label: "Automatic", hint: "applied during scans" },
              ] as const).map((m) => (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => void patchConfig({ writeBack: m.key })}
                  className={cn(
                    "flex flex-col items-start gap-0.5 rounded-[4px] border px-3 py-2.5 text-left transition-colors",
                    cfg.writeBack === m.key
                      ? "border-[var(--primary)] bg-[var(--primary)]/10 text-[var(--fg)]"
                      : "border-[var(--border)] bg-[var(--bg)] text-[var(--fg-dim)] hover:bg-[var(--hover)]",
                  )}
                >
                  <span className="text-[13px] font-bold">{m.label}</span>
                  <span className="text-[11px] text-[var(--fg-dim)]">{m.hint}</span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--fg-dim)]">
              Image uploads require a writable Jellyfin metadata folder; failures are surfaced per finding in the Enrichments tab.
            </p>
          </div>
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-4">
            <h3 className="mb-1 text-[14px] font-extrabold text-[var(--fg)]">Internet sources</h3>
            <p className="mb-3 text-[12px] text-[var(--fg-dim)]">
              Free public APIs; requests are rate-limited and attributed to the agent. Fanart.tv additionally needs a free personal API key (get one at
              fanart.tv → get-an-api-key) — it is the reliable artist-photo source when Deezer's CDN blocks this network.
            </p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {Object.entries(cfg.sources).map(([src, on]) => (
                <button
                  key={src}
                  type="button"
                  onClick={() => void patchConfig({ sources: { ...cfg.sources, [src]: !on } })}
                  className="flex items-center justify-between rounded-[4px] bg-[var(--bg)] px-3 py-2.5 text-left transition-colors hover:bg-[var(--hover)]"
                >
                  <span className="text-[13px] font-semibold text-[var(--fg)]">{SOURCE_LABELS[src] ?? src}</span>
                  <Pill tone={on ? "good" : "neutral"}>{on ? "enabled" : "off"}</Pill>
                </button>
              ))}
            </div>
            <div className="mt-3">
              <TextField
                label="Fanart.tv API key"
                value={cfg.fanartApiKey}
                placeholder="paste your personal key — or set the FANARTTV_API_KEY env var"
                onCommit={(v) => void patchConfig({ fanartApiKey: v })}
              />
              <p className="mt-1.5 text-[11px] text-[var(--fg-dim)]">
                Without a key, artist photos fall back to Deezer (blocked on some networks) and Wikipedia thumbnails. The health check reports whether the
                key works.
              </p>
            </div>
          </div>
          <div className="rounded-[6px] border border-[var(--border)] bg-[var(--elevated)] p-4">
            <h3 className="mb-2 text-[14px] font-extrabold text-[var(--fg)]">What the agent does with it</h3>
            <ul className="list-inside list-disc space-y-1.5 text-[12.5px] leading-relaxed text-[var(--fg-dim)]">
              <li>Missing album &amp; artist artwork is served automatically by the image proxy (replaces initials tiles) — artist photos come from Fanart.tv (with API key), Deezer or Wikipedia.</li>
              <li>Artist pages show the internet, not just your library: a Wikipedia biography next to the Jellyfin overview, plus a MusicBrainz discography section listing releases that are not in your library.</li>
              <li>Tracks without lyrics get synced/plain lyrics from LRCLIB on playback.</li>
              <li>Albums missing year/genre/track-count get metadata from Deezer/iTunes/MusicBrainz.</li>
              <li>
                With write-back enabled, all of the above is also written into Jellyfin itself — permanent, and visible in every client (music players,
                smart TVs, mobile apps) that talks to your server.
              </li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- pieces

function RunCard({ run }: { run: AgentRunRow }) {
  const [open, setOpen] = useState(false);
  const tone = run.status === "success" ? "good" : run.status === "running" ? "accent" : run.status === "partial" ? "warn" : run.status === "failed" ? "bad" : "neutral";
  return (
    <div className="rounded-[4px] bg-[var(--bg)] px-3 py-2.5">
      <button type="button" className="flex w-full items-center gap-2.5 text-left" onClick={() => setOpen((v) => !v)}>
        <StatusIcon status={run.status === "success" ? "ok" : run.status === "partial" ? "warn" : run.status === "running" ? "warn" : "fail"} />
        <span className="text-[13px] font-bold capitalize text-[var(--fg)]">{run.jobType}</span>
        <Pill tone={tone}>{run.status}</Pill>
        <span className="ml-auto flex items-center gap-3 text-[11.5px] text-[var(--fg-dim)]">
          <span className="flex items-center gap-1">
            <Clock size={11} />
            {timeAgo(run.startedAt)}
          </span>
          {run.durationMs != null && <span>{(run.durationMs / 1000).toFixed(1)}s</span>}
          <span>
            {run.processed} processed · {run.enriched} enriched
          </span>
        </span>
      </button>
      {run.error && <div className="mt-1.5 whitespace-pre-wrap rounded bg-red-500/10 px-2 py-1.5 text-[11.5px] text-red-300">{run.error}</div>}
      {open && run.log && (
        <pre className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded bg-[var(--elevated)] p-2 font-mono text-[11px] leading-snug text-[var(--fg-dim)]">
          {run.log}
        </pre>
      )}
      {open && !run.log && <p className="mt-2 text-[11.5px] text-[var(--fg-dim)]">No log captured for this run.</p>}
    </div>
  );
}

function ScoreSparkline({ history }: { history: HistoryPoint[] }) {
  if (history.length === 0) return <p className="text-[13px] text-[var(--fg-dim)]">No history yet.</p>;
  const W = 100;
  const H = 32;
  const pts = history.map((h, i) => `${(i / Math.max(history.length - 1, 1)) * W},${H - (h.score / 100) * H}`).join(" ");
  const media = history.map((h, i) => `${(i / Math.max(history.length - 1, 1)) * W},${H - h.mediaReadable * H}`).join(" ");
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-24 w-full" aria-label="Health score history chart">
        <polyline points={media} fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
        <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex gap-4 text-[11px] text-[var(--fg-dim)]">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4" style={{ background: "var(--primary)" }} /> health score
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-0.5 w-4 bg-white/20" /> media readability
        </span>
      </div>
    </div>
  );
}

function NumberField({ label, value, min, max, onCommit }: { label: string; value: number; min: number; max: number; onCommit: (v: number) => void }) {
  // draft state with adjust-during-render reset when the prop value changes
  const [state, setState] = useState({ lastProp: value, draft: String(value) });
  if (state.lastProp !== value) {
    setState({ lastProp: value, draft: String(value) });
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--fg-dim)]">{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        value={state.draft}
        onChange={(e) => setState({ ...state, draft: e.target.value })}
        onBlur={() => {
          const n = Number(state.draft);
          if (!Number.isNaN(n) && n >= min && n <= max && n !== value) onCommit(n);
          setState({ lastProp: value, draft: String(value) });
        }}
        className="fs-input h-9"
      />
    </label>
  );
}

function TextField({ label, value, placeholder, onCommit }: { label: string; value: string; placeholder?: string; onCommit: (v: string) => void }) {
  // draft state with adjust-during-render reset when the prop value changes
  const [state, setState] = useState({ lastProp: value, draft: value });
  if (state.lastProp !== value) {
    setState({ lastProp: value, draft: value });
  }
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--fg-dim)]">{label}</span>
      <input
        type="text"
        value={state.draft}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setState({ ...state, draft: e.target.value })}
        onBlur={() => {
          const v = state.draft.trim();
          if (v !== value) onCommit(v);
          else setState({ lastProp: value, draft: value });
        }}
        className="fs-input h-9 font-mono text-[12.5px]"
      />
    </label>
  );
}
