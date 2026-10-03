#!/bin/bash
# One-shot digest verification: boots the dev server, triggers the play-count
# snapshot, polls the digest endpoint until it reports, then shuts down.
cd /home/z/my-project
setsid nohup bun run dev >/dev/null 2>&1 < /dev/null & disown
SERVER_PID=$!

echo "== waiting for boot =="
for i in $(seq 1 30); do
  code=$(curl -s -o /dev/null -w "%{http_code}" -m 5 http://localhost:3000/ 2>/dev/null)
  [ "$code" = "200" ] && break
  sleep 2
done
echo "boot: HTTP $code after $((i*2))s"

echo "== triggering digest snapshot =="
curl -s -m 15 -X POST -H "Content-Type: application/json" -d '{"job":"digest"}' http://localhost:3000/api/agent/run
echo ""

echo "== polling digest (up to 4 min) =="
for i in $(seq 1 48); do
  sleep 5
  RESP=$(curl -s -m 20 http://localhost:3000/api/agent/digest 2>/dev/null)
  if [ -n "$RESP" ]; then
    echo "$RESP" | python3 -c "
import json,sys
try:
    d = json.load(sys.stdin)
except Exception as e:
    print('parse error:', e); sys.exit(1)
dg = d.get('digest', {})
print('snapshotRunning:', d.get('snapshotRunning'))
print('status:', dg.get('status'))
print('windowLabel:', dg.get('windowLabel'))
print('days:', dg.get('days'), '| snapshotDays:', dg.get('snapshotDays'), '| artistsTracked:', dg.get('artistsTracked'))
print('totalPlays:', dg.get('totalPlays'))
print('reason:', dg.get('reason'))
arts = dg.get('artists', [])[:8]
for i, a in enumerate(arts, 1):
    print(f\"  {i}. {a['artistName']}  +{a['delta']} plays  ({a['total']} all-time){' [new]' if a['isNew'] else ''}\")
"
    # keep polling until snapshot finishes so the stored data is fresh
    RUNNING=$(echo "$RESP" | python3 -c "import json,sys; print(json.load(sys.stdin).get('snapshotRunning'))" 2>/dev/null)
    [ "$RUNNING" = "False" ] && break
  else
    echo "poll $i: no response (server reaped?)"
  fi
done

echo "== last digest GET =="
curl -s -m 20 http://localhost:3000/api/agent/digest | head -c 900
echo ""
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
echo "== done, server stopped =="
