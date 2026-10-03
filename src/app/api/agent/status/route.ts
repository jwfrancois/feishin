// Library Agent API — GET /api/agent/status
// One-stop status snapshot for the dashboard: config, scheduler state, last
// runs, finding counters, and the latest health summary.
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureConfig } from "@/lib/agent/config";
import { ensureAgentStarted, getAgentRuntimeInfo, isJobRunning } from "@/lib/agent/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureAgentStarted();
  try {
    const [cfg, healthRun, scanRun, auditRun, releasesRun, latestHealth, counts, pending] = await Promise.all([
      ensureConfig(),
      db.agentRun.findFirst({ where: { jobType: "health" }, orderBy: { startedAt: "desc" } }),
      db.agentRun.findFirst({ where: { jobType: "scan" }, orderBy: { startedAt: "desc" } }),
      db.agentRun.findFirst({ where: { jobType: "audit" }, orderBy: { startedAt: "desc" } }),
      db.agentRun.findFirst({ where: { jobType: "releases" }, orderBy: { startedAt: "desc" } }),
      db.healthSnapshot.findFirst({ orderBy: { id: "desc" } }),
      db.agentFinding.groupBy({ by: ["kind", "status"], _count: { _all: true } }),
      db.agentFinding.count({ where: { status: "pending" } }),
    ]);

    const byKind: Record<string, Record<string, number>> = {};
    for (const row of counts) {
      byKind[row.kind] ??= {};
      byKind[row.kind][row.status] = row._count._all;
    }

    return NextResponse.json({
      ok: true,
      config: cfg,
      runtime: getAgentRuntimeInfo(),
      running: { health: isJobRunning("health"), scan: isJobRunning("scan"), audit: isJobRunning("audit"), releases: isJobRunning("releases") },
      lastHealthRun: healthRun,
      lastScanRun: scanRun,
      lastAuditRun: auditRun,
      lastReleasesRun: releasesRun,
      latestHealth: latestHealth
        ? { ...latestHealth, checks: JSON.parse(latestHealth.checks ?? "[]") }
        : null,
      findingCounts: byKind,
      pendingCount: pending,
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "status failed" }, { status: 500 });
  }
}
