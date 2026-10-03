// Library Agent API — POST /api/agent/findings/[id]/apply
// Writes one scraped finding back into the Jellyfin server (metadata write-back).
import { NextResponse } from "next/server";
import { ensureAgentStarted } from "@/lib/agent/scheduler";
import { applyFindingToJellyfin } from "@/lib/agent/writeback";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  ensureAgentStarted();
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]+$/.test(id)) {
    return NextResponse.json({ ok: false, error: "Invalid finding id" }, { status: 400 });
  }
  try {
    const result = await applyFindingToJellyfin(id);
    return NextResponse.json({ ok: result.ok, result });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "write-back failed" }, { status: 500 });
  }
}
