// Library Agent — scheduler. A globalThis-singleton timer loop that wakes every
// 30 s, consults the persisted config, and launches due jobs (health / scan)
// exactly once each (concurrency-guarded). Started from instrumentation on boot
// and lazily re-armed by agent API routes in case instrumentation was skipped.
import { db } from "@/lib/db";
import { ensureConfig } from "./config";
import { runHealthJob, recordHealthSnapshot } from "./jobs/health";
import { runScanJob } from "./jobs/scan";
import { runAuditJob } from "./jobs/audit";
import { runReleasesJob } from "./jobs/releases";
import { runDigestSnapshot } from "./jobs/digest";

export type JobId = "health" | "scan" | "audit" | "releases" | "digest";
// fixed schedules for the audit-style jobs (no config UI yet — sensible defaults)
const AUDIT_INTERVAL_MIN = 60; // rolling audit window — hourly drips cover even 6-figure libraries
const RELEASES_INTERVAL_MIN = 720; // release radar twice a day
const DIGEST_INTERVAL_MIN = 1440; // play-count snapshot for the listening digest — daily

interface AgentRuntime {
  timer: ReturnType<typeof setInterval> | null;
  running: Set<JobId>;
  startedAt: number;
  booted: boolean;
  lastTick: number;
}

interface GlobalAgent {
  __feishinAgent?: AgentRuntime;
}

const g = globalThis as typeof globalThis & GlobalAgent;

const runtime: AgentRuntime = (g.__feishinAgent ??= {
  timer: null,
  running: new Set(),
  startedAt: Date.now(),
  booted: false,
  lastTick: 0,
});

async function lastRunAt(jobType: JobId): Promise<number> {
  const row = await db.agentRun.findFirst({ where: { jobType, status: { not: "running" } }, orderBy: { startedAt: "desc" }, select: { startedAt: true } });
  return row ? row.startedAt.getTime() : 0;
}

export function isJobRunning(job: JobId): boolean {
  return runtime.running.has(job);
}

export function getAgentRuntimeInfo() {
  return {
    startedAt: runtime.startedAt,
    booted: runtime.booted,
    running: [...runtime.running],
    lastTick: runtime.lastTick,
    timerAlive: runtime.timer !== null,
  };
}

/** Execute a job with full run bookkeeping. Safe to call manually (dashboard buttons). */
export async function runJobNow(job: JobId, trigger: "manual" | "schedule" = "manual"): Promise<string> {
  if (runtime.running.has(job)) return "already-running";
  runtime.running.add(job);
  const run = await db.agentRun.create({ data: { jobType: job, status: "running" } });
  const t0 = Date.now();
  let status = "success";
  let error: string | null = null;
  let processed = 0;
  let enriched = 0;
  let missing = 0;
  let log: string | null = null;
  try {
    if (job === "health") {
      const result = await runHealthJob();
      await recordHealthSnapshot(result);
      processed = result.checks.length;
      enriched = result.score;
      log = result.checks.map((c) => `${c.status.toUpperCase().padEnd(5)} ${c.name}: ${c.detail}`).join("\n");
      if (result.overall !== "healthy") status = result.overall === "critical" ? "failed" : "partial";
    } else if (job === "audit") {
      const result = await runAuditJob();
      processed = result.processed;
      enriched = result.enriched;
      missing = result.missing;
      log = result.logLines.join("\n");
    } else if (job === "releases") {
      const result = await runReleasesJob();
      processed = result.processed;
      enriched = result.enriched;
      missing = result.missing;
      log = result.logLines.join("\n");
    } else if (job === "digest") {
      const result = await runDigestSnapshot();
      processed = result.processed;
      enriched = result.enriched;
      missing = result.missing;
      log = result.logLines.join("\n");
    } else {
      const result = await runScanJob();
      processed = result.processed;
      enriched = result.enriched;
      missing = result.missing;
      log = result.logLines.join("\n");
      if (result.processed === 0) status = "partial";
    }
  } catch (err) {
    status = "failed";
    error = err instanceof Error ? `${err.message}\n${err.stack?.split("\n").slice(1, 4).join("\n") ?? ""}` : String(err);
  } finally {
    runtime.running.delete(job);
    await db.agentRun
      .update({
        where: { id: run.id },
        data: {
          status,
          finishedAt: new Date(),
          durationMs: Date.now() - t0,
          processed,
          enriched,
          missing,
          error,
          log: log ? log.slice(0, 8000) : null,
        },
      })
      .catch(() => undefined);
    if (process.env.NODE_ENV !== "production") {
      console.log(`[agent] ${job} (${trigger}) -> ${status} in ${Date.now() - t0}ms (processed ${processed}, enriched ${enriched})`);
    }
  }
  return run.id;
}

async function tick(): Promise<void> {
  runtime.lastTick = Date.now();
  try {
    const cfg = await ensureConfig();
    if (!cfg.enabled) return;
    const now = Date.now();
    const [healthAt, scanAt, auditAt, releasesAt, digestAt] = await Promise.all([
      lastRunAt("health"),
      lastRunAt("scan"),
      lastRunAt("audit"),
      lastRunAt("releases"),
      lastRunAt("digest"),
    ]);
    if (!runtime.running.has("health") && now - healthAt >= cfg.healthIntervalMin * 60_000) {
      void runJobNow("health", "schedule");
    }
    if (!runtime.running.has("scan") && now - scanAt >= cfg.scanIntervalMin * 60_000) {
      void runJobNow("scan", "schedule");
    }
    if (!runtime.running.has("audit") && now - auditAt >= AUDIT_INTERVAL_MIN * 60_000) {
      void runJobNow("audit", "schedule");
    }
    if (!runtime.running.has("releases") && now - releasesAt >= RELEASES_INTERVAL_MIN * 60_000) {
      void runJobNow("releases", "schedule");
    }
    if (!runtime.running.has("digest") && now - digestAt >= DIGEST_INTERVAL_MIN * 60_000) {
      void runJobNow("digest", "schedule");
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") console.warn("[agent] tick error:", err instanceof Error ? err.message : err);
  }
}

/** Idempotent — safe to call from instrumentation AND from API routes. */
export function ensureAgentStarted(): void {
  if (runtime.booted && runtime.timer) return;
  runtime.booted = true;
  if (runtime.timer) return;
  runtime.startedAt = Date.now();
  // kick off an initial health check shortly after boot, first scan a bit later
  setTimeout(() => void tick(), 4_000);
  runtime.timer = setInterval(() => void tick(), 30_000);
  if (process.env.NODE_ENV !== "production") console.log("[agent] scheduler started");
}
