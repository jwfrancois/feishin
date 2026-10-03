// Feishin rebuild — client bridge to the Library Agent (/api/agent/*).
// Used by views to consume agent-scraped knowledge (bios, lyrics, metadata).
export interface AgentFindingShape {
  kind: string;
  status: string;
  source: string;
  summary: string;
  payload: Record<string, unknown>;
  updatedAt?: string;
}

export async function getAgentFinding(
  itemId: string,
  kind: "bio" | "artwork" | "metadata" | "lyrics",
  params: { name?: string; artist?: string; album?: string; duration?: number; itemType?: "album" | "artist"; fetch?: boolean } = {},
): Promise<{ finding: AgentFindingShape | null; lines?: { time: number; text: string }[] | null }> {
  const sp = new URLSearchParams({ kind });
  if (params.name) sp.set("name", params.name);
  if (params.artist) sp.set("artist", params.artist);
  if (params.album) sp.set("album", params.album);
  if (params.duration) sp.set("duration", String(Math.round(params.duration)));
  if (params.itemType) sp.set("itemType", params.itemType);
  if (params.fetch) sp.set("fetch", "1");
  const res = await fetch(`/api/agent/enrichment/${itemId}?${sp.toString()}`, { cache: "no-store" });
  if (!res.ok) return { finding: null };
  const data = (await res.json()) as { finding?: AgentFindingShape | null; lines?: { time: number; text: string }[] | null };
  return { finding: data.finding ?? null, lines: data.lines ?? null };
}
