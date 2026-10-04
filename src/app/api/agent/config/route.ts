// Library Agent API — GET / PATCH /api/agent/config
import { NextRequest, NextResponse } from "next/server";
import { ensureConfig, updateConfig, type AgentConfigData } from "@/lib/agent/config";
import { ensureAgentStarted } from "@/lib/agent/scheduler";

export const dynamic = "force-dynamic";

export async function GET() {
  ensureAgentStarted();
  try {
    return NextResponse.json({ ok: true, config: await ensureConfig() });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "config read failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  ensureAgentStarted();
  try {
    const body = (await req.json().catch(() => ({}))) as Partial<AgentConfigData>;
    const config = await updateConfig(body);
    return NextResponse.json({ ok: true, config });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : "config update failed" }, { status: 500 });
  }
}
