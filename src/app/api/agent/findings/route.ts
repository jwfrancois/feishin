// Library Agent API — GET /api/agent/findings
// Paginated findings list for the dashboard table. Filters: kind, status, q (name search).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { ensureAgentStarted } from "@/lib/agent/scheduler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  ensureAgentStarted();
  try {
    const sp = req.nextUrl.searchParams;
    const kind = sp.get("kind") ?? undefined;
    const status = sp.get("status") ?? undefined;
    const q = sp.get("q") ?? undefined;
    const limit = Math.min(Number(sp.get("limit") ?? 60) || 60, 200);
    const offset = Number(sp.get("offset") ?? 0) || 0;

    const where = {
      ...(kind ? { kind } : {}),
      ...(status ? { status } : {}),
      ...(q ? { OR: [{ itemName: { contains: q } }, { itemSubtitle: { contains: q } }] } : {}),
    };

    const [items, total] = await Promise.all([
      db.agentFinding.findMany({ where, orderBy: { updatedAt: "desc" }, take: limit, skip: offset }),
      db.agentFinding.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      total,
      items: items.map((f) => ({
        id: f.id,
        itemId: f.itemId,
        itemType: f.itemType,
        itemName: f.itemName,
        itemSubtitle: f.itemSubtitle,
        kind: f.kind,
        source: f.source,
        status: f.status,
        summary: f.summary,
        serverStatus: f.serverStatus,
        serverError: f.serverError,
        serverSyncedAt: f.serverSyncedAt,
        payload: safeJson(f.payload),
        updatedAt: f.updatedAt,
      })),
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "findings failed" }, { status: 500 });
  }
}

function safeJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return {};
  }
}
