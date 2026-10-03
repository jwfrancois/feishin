// Library Agent API — POST /api/agent/run  { job: "health" | "scan" }
// Manually trigger a job (dashboard buttons). Returns immediately; the job runs
// in the background and its progress shows up via /api/agent/status polling.
import { NextRequest, NextResponse } from "next/server";
import { ensureAgentStarted, isJobRunning, runJobNow } from "@/lib/agent/scheduler";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  ensureAgentStarted();
  try {
    const body = (await req.json().catch(() => ({}))) as { job?: string };
    const job = body.job === "scan" ? "scan" : body.job === "health" ? "health" : null;
    if (!job) return NextResponse.json({ ok: false, error: 'body must be {"job":"health"|"scan"}' }, { status: 400 });
    if (isJobRunning(job)) {
      return NextResponse.json({ ok: true, runId: null, started: false });
    }
    // fire-and-forget — runJobNow has its own concurrency guard + run bookkeeping
    void runJobNow(job, "manual");
    return NextResponse.json({ ok: true, started: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "run failed" }, { status: 500 });
  }
}
