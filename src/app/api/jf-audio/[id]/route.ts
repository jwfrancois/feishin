// Feishin rebuild — audio stream proxy (direct play w/ Range passthrough, universal-transcode fallback)
import { NextRequest, NextResponse } from "next/server";
import { jfFetch, getConnectionState, getConnectionRaw } from "@/lib/jf-server";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/**
 * GET /api/jf-audio/{itemId}[?mode=universal]
 *  - default: /Audio/{id}/stream?static=true (original file, byte-exact, seekable via Range)
 *  - ?mode=universal: /Audio/{id}/universal (server transcodes to aac/mp4 when the browser can't play the source)
 */
export async function GET(req: NextRequest, ctx: Ctx) {
  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid item id" }, { status: 400 });
  }
  const universal = req.nextUrl.searchParams.get("mode") === "universal";
  const range = req.headers.get("range");

  const params = new URLSearchParams();
  let upstreamPath: string;
  if (universal) {
    const { userId } = getConnectionState();
    params.set("UserId", userId ?? "");
    params.set("DeviceId", "feishin-web-client");
    params.set("MaxStreamingBitrate", "320000");
    params.set("Container", "opus,mp3,aac,m4a,m4b,flac,webma,webm,wav,ogg");
    params.set("TranscodingContainer", "mp4");
    params.set("AudioCodec", "aac");
    upstreamPath = `Audio/${id}/universal`;
  } else {
    params.set("static", "true");
    upstreamPath = `Audio/${id}/stream`;
  }
  // api_key in query too — audio routes on some setups ignore header-only auth
  const { apiKey, token } = getConnectionRaw();
  params.set("api_key", token || apiKey);

  try {
    const upstream = await jfFetch(upstreamPath, {
      params,
      extraHeaders: range ? { Range: range } : undefined,
    });

    if (!upstream.ok && upstream.status !== 206) {
      // 404/500 here almost always means the file itself is unreadable
      // server-side (unmounted media share), not a proxy problem — say so.
      const detail = (await upstream.text().catch(() => "")).slice(0, 120);
      const hint =
        upstream.status === 404
          ? " — file missing or its media share is unmounted on the server"
          : upstream.status === 500
            ? " — server could not read/transcode the source (offline media share?)"
            : "";
      return NextResponse.json({ error: `Jellyfin audio ${upstream.status}${hint}`, detail }, { status: upstream.status });
    }

    const headers = new Headers();
    headers.set("Cache-Control", "no-store");
    for (const h of ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]) {
      const v = upstream.headers.get(h);
      if (v) headers.set(h, v);
    }
    if (!headers.has("Accept-Ranges")) headers.set("Accept-Ranges", "bytes");
    // browsers refuse to play some audio served as video/mp4 via <audio>; normalize
    const ct = headers.get("Content-Type") ?? "";
    if (ct.includes("video/mp4")) headers.set("Content-Type", "audio/mp4");
    if (!ct) headers.set("Content-Type", "application/octet-stream");

    return new Response(upstream.body, { status: upstream.status, headers });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Audio proxy failed" }, { status: 502 });
  }
}
