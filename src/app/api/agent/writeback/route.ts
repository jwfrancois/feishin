// Library Agent API — POST /api/agent/writeback
// Batch write-back: pushes every eligible scraped finding (found, not yet
// synced) into the Jellyfin server. Body: { limit?: number, kind?: string }.
import { NextRequest, NextResponse } from "next/server";
import { ensureAgentStarted } from "@/lib/agent/scheduler";
import { applyBatchToJellyfin, isBatchRunning } from "@/lib/agent/writeback";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET() {
  ensureAgentStarted();
  return NextResponse.json({ ok: true, running: isBatchRunning() });
}

export async function POST(req: NextRequest) {
  ensureAgentStarted();
  if (isBatchRunning()) {
    return NextResponse.json({ ok: false, error: "A write-back batch is already running" }, { status: 409 });
  }
  try {
    const body = (await req.json().catch(() => ({}))) as { limit?: number; kind?: string };
    // fire-and-forget: the dashboard polls status; long batches must not block the response
    const batch = applyBatchToJellyfin({ limit: body.limit, kind: body.kind });
    void batch;
    return NextResponse.json({ ok: true, started: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "write-back failed" }, { status: 500 });
  }
}
