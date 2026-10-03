#!/bin/bash
# Simulate Feishin's playback-reporting flow (start -> progress -> stop) with curl
BASE="https://manitou.dyabavadra.com"
AUTH='MediaBrowser Client="Feishin Web", Device="Feishin Web", DeviceId="feishin-web-client", Version="0.16.0"'
TRACK="6bde8cc0058c3b45c4b4b5c43b9db28e"

echo "=== 1. AuthenticateByName ==="
AUTH_JSON=$(curl -sS -m 20 -X POST -H "Content-Type: application/json" -H "X-Emby-Authorization: $AUTH" \
  -d '{"Username":"dyabavadra","Pw":"bonjour66"}' "$BASE/Users/AuthenticateByName")
TOKEN=$(echo "$AUTH_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['AccessToken'])")
USERID=$(echo "$AUTH_JSON" | python3 -c "import json,sys; print(json.load(sys.stdin)['User']['Id'])")
echo "token acquired, userId=$USERID"

echo "=== 2. start: POST /Sessions/Playing ==="
curl -sS -o /dev/null -w "%{http_code}\n" -m 20 -X POST \
  -H "Content-Type: application/json" -H "X-Emby-Authorization: $AUTH" -H "X-Emby-Token: $TOKEN" \
  -d "{\"ItemId\":\"$TRACK\",\"PositionTicks\":0,\"IsPaused\":false,\"PlaySessionId\":\"feishin-test-1\",\"UserId\":\"$USERID\"}" \
  "$BASE/Sessions/Playing"

echo "=== 3. progress: POST /Sessions/Playing/Progress ==="
curl -sS -m 20 -X POST \
  -H "Content-Type: application/json" -H "X-Emby-Authorization: $AUTH" -H "X-Emby-Token: $TOKEN" \
  -d "{\"ItemId\":\"$TRACK\",\"PositionTicks\":300000000,\"IsPaused\":false,\"EventName\":\"unpause\",\"PlaySessionId\":\"feishin-test-1\"}" \
  -w "\nHTTP %{http_code}\n" "$BASE/Sessions/Playing/Progress"

echo "=== 4. stop: POST /Sessions/Playing/Stopped ==="
curl -sS -o /dev/null -w "%{http_code}\n" -m 20 -X POST \
  -H "Content-Type: application/json" -H "X-Emby-Authorization: $AUTH" -H "X-Emby-Token: $TOKEN" \
  -d "{\"ItemId\":\"$TRACK\",\"PositionTicks\":400000000,\"IsPaused\":true,\"PlaySessionId\":\"feishin-test-1\"}" \
  "$BASE/Sessions/Playing/Stopped"

echo "=== 5. sessions list (verify NowPlayingItem cleared) ==="
curl -sS -m 20 -H "X-Emby-Authorization: $AUTH" -H "X-Emby-Token: $TOKEN" "$BASE/Sessions" | python3 -c "
import json,sys
ss=json.load(sys.stdin)
for x in ss:
    if x.get('UserName')=='dyabavadra':
        print('session:', x.get('DeviceName'), '| NowPlaying:', (x.get('NowPlayingItem') or {}).get('Name'))
print('total sessions:', len(ss))"
