// Library Agent API — /api/agent/digest
//   GET  → the monthly "most-played artists" digest (diff of daily play-count
//          snapshots: newest vs. oldest inside the month-to-date window,
//          falling back to a trailing-30-day window while the month is young).
//   POST → trigger a play-count snapshot now (background job, same scheduler
//          pipeline as health/scan/audit; poll GET until it lands).
import { NextResponse } from "next/server";
import { ensureAgentStarted, isJobRunning, runJobNow } from "@/lib/agent/scheduler";
import { computeMonthlyDigest } from "@/lib/agent/jobs/digest";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureAgentStarted();
  try {
    const digest = await computeMonthlyDigest();
    return NextResponse.json({ ok: true, digest, snapshotRunning: isJobRunning("digest") });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "digest failed" }, { status: 500 });
  }
}

export async function POST() {
  ensureAgentStarted();
  try {
    if (isJobRunning("digest")) return NextResponse.json({ ok: true, started: false });
    void runJobNow("digest", "manual");
    return NextResponse.json({ ok: true, started: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "snapshot failed" }, { status: 500 });
  }
}
