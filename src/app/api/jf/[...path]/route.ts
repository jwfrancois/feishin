// Feishin rebuild — JSON proxy for the Jellyfin server (GET cached w/ SWR, POST/DELETE passthrough)
import { NextRequest, NextResponse } from "next/server";
import { jfGetCached, jfJson, invalidateJfCache, ensureReady, configureConnection } from "@/lib/jf-server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ path?: string[] }> };

function joined(path: string[] | undefined): string {
  return (path ?? []).map((p) => decodeURIComponent(p)).join("/");
}

const SAFE = /^[A-Za-z0-9/_\-.,%~]+$/;

const TTL_RULES: [RegExp, number][] = [
  [/^System\/Info/, 60_000],
  [/^Genres/, 30 * 60_000],
  [/^Playlists\/[^/]+\/Items$/, 60_000],
  [/^Items\/[^/]+\/Similar/, 10 * 60_000],
  [/^Audio\/[^/]+\/Lyrics/, 10 * 60_000],
  [/sortBy=Random/i, 15 * 60_000],
  [/sortBy=DateCreated/i, 3 * 60_000],
  [/Filters=IsFavorite/i, 30_000],
];

function ttlFor(path: string, qs: string): number {
  for (const [re, ttl] of TTL_RULES) {
    if (re.test(path) || re.test(qs)) return ttl;
  }
  return 2 * 60_000;
}

export async function GET(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const p = joined(path);
  if (!p || !SAFE.test(p)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  const qs = req.nextUrl.searchParams.toString();
  try {
    const data = await jfGetCached(p, req.nextUrl.searchParams, ttlFor(p, qs));
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Jellyfin request failed" }, { status: 502 });
  }
}

export async function POST(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const p = joined(path);
  if (!p || !SAFE.test(p)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  try {
    if (p === "__configure") {
      const body = (await req.json()) as { url?: string; username?: string; password?: string; apiKey?: string };
      const state = await configureConnection(body);
      return NextResponse.json(state);
    }
    if (p === "__ready") {
      const state = await ensureReady();
      return NextResponse.json(state);
    }
    const body = await req.json().catch(() => undefined);
    const data = await jfJson(p, { method: "POST", params: req.nextUrl.searchParams, body });
    invalidateJfCache("Playlists");
    invalidateJfCache("Filters=IsFavorite");
    return NextResponse.json(data ?? {});
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Jellyfin request failed" }, { status: 502 });
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { path } = await ctx.params;
  const p = joined(path);
  if (!p || !SAFE.test(p)) {
    return NextResponse.json({ error: "Invalid path" }, { status: 400 });
  }
  try {
    const res = await jfJson(p, { method: "DELETE", params: req.nextUrl.searchParams });
    invalidateJfCache("Playlists");
    invalidateJfCache("Items");
    return NextResponse.json(res ?? {});
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Jellyfin request failed" }, { status: 502 });
  }
}
