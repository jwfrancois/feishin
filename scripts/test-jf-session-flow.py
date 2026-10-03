#!/usr/bin/env python3
"""Simulate Feishin's playback-reporting flow against the real Jellyfin server."""
import json
import urllib.request

BASE = "https://manitou.dyabavadra.com"
AUTH = 'MediaBrowser Client="Feishin Web", Device="Feishin Web", DeviceId="feishin-web-client", Version="0.16.0"'
USERNAME = "dyabavadra"
PASSWORD = "bonjour66"
TRACK = "6bde8cc0058c3b45c4b4b5c43b9db28e"  # Eraser (unmounted share item, same as user's log)


def req(method: str, path: str, body: dict | None = None, token: str | None = None) -> tuple[int, str]:
    headers = {
        "Content-Type": "application/json",
        "X-Emby-Authorization": AUTH + (f', Token="{token}"' if token else ""),
    }
    if token:
        headers["X-Emby-Token"] = token
    data = json.dumps(body).encode() if body is not None else None
    r = urllib.request.Request(f"{BASE}/{path}", data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r, timeout=20) as resp:
            return resp.status, resp.read(200).decode(errors="replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read(200).decode(errors="replace")


# 1. authenticate
status, body = req("POST", "Users/AuthenticateByName", {"Username": USERNAME, "Pw": PASSWORD})
print(f"auth raw: {status} {body[:150]!r}", flush=True)
try:
    auth = json.loads(body)
    token, user_id = auth["AccessToken"], auth["User"]["Id"]
    print(f"auth: {status}  user={user_id}", flush=True)
except Exception as e:
    print(f"auth failed to parse: {e}", flush=True)
    raise SystemExit(1)

# 2. start  (correct route: POST /Sessions/Playing)
s, b = req("POST", "Sessions/Playing", {"ItemId": TRACK, "PositionTicks": 0, "IsPaused": False, "PlaySessionId": "test-123"}, token)
print(f"start  Sessions/Playing            -> {s} {b[:80]}")

# 3. progress  (with session established)
s, b = req("POST", "Sessions/Playing/Progress", {"ItemId": TRACK, "PositionTicks": 30 * 10_000_000, "IsPaused": False, "EventName": "unpause", "PlaySessionId": "test-123"}, token)
print(f"progress Sessions/Playing/Progress -> {s} {b[:80]}")

# 4. stop
s, b = req("POST", "Sessions/Playing/Stopped", {"ItemId": TRACK, "PositionTicks": 40 * 10_000_000, "IsPaused": True, "PlaySessionId": "test-123"}, token)
print(f"stop    Sessions/Playing/Stopped   -> {s} {b[:80]}")

# 5. sanity: does the session show up?
s, b = req("GET", "Sessions", None, token)
try:
    sessions = json.loads(b)
    print(f"sessions: {s}, count={len(sessions)}, now-playing={[x.get('NowPlayingItem', {}).get('Name') for x in sessions]}")
except Exception:
    print(f"sessions: {s} {b[:80]}")
