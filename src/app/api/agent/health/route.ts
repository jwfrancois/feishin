// Library Agent API — GET /api/agent/health
// Latest health snapshot; add ?history=N for the N most recent snapshots (charts).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAgentStarted } from "@/lib/agent/scheduler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  ensureAgentStarted();
  try {
    const history = Number(req.nextUrl.searchParams.get("history") ?? 0) || 0;
    const latest = await db.healthSnapshot.findFirst({ orderBy: { id: "desc" } });
    if (!latest) return NextResponse.json({ ok: true, latest: null, history: [] });
    const hist = history
      ? await db.healthSnapshot.findMany({ orderBy: { id: "desc" }, take: Math.min(history, 240), select: { id: true, overall: true, score: true, serverLatency: true, mediaReadable: true, memoryMb: true } })
      : [];
    return NextResponse.json({
      ok: true,
      latest: { ...latest, checks: JSON.parse(latest.checks ?? "[]") },
      history: hist.reverse(),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "health lookup failed" }, { status: 500 });
  }
}
