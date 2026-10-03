#!/bin/bash
# Round 3: fresh real snapshot -> seed baseline -> verify ready digest -> clean.
cd /home/z/my-project
python3 scripts/digest-db-helper.py clean

setsid nohup bun run dev >/dev/null 2>&1 < /dev/null & disown
for i in $(seq 1 20); do [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:3000/)" = "200" ] && break; sleep 2; done
echo "== server up, taking fresh real snapshot =="
curl -s -m 15 -X POST -H "Content-Type: application/json" -d '{"job":"digest"}' http://localhost:3000/api/agent/run > /dev/null
for i in $(seq 1 40); do
  sleep 5
  R=$(curl -s -m 20 http://localhost:3000/api/agent/digest 2>/dev/null | python3 -c "import json,sys; print(json.load(sys.stdin).get('snapshotRunning'))" 2>/dev/null)
  [ "$R" = "False" ] && break
done
python3 -c "
import sqlite3
con = sqlite3.connect('/home/z/my-project/db/custom.db')
print('real snapshot rows:', con.execute('SELECT COUNT(*) FROM PlaySnapshot').fetchone()[0])
"
python3 scripts/digest-db-helper.py seed

echo "== GET digest (expect ready, correct ordering + deltas) =="
curl -s -m 30 http://localhost:3000/api/agent/digest | python3 -c "
import json,sys
d = json.load(sys.stdin)
dg = d['digest']
print('status:', dg['status'], '|', dg['windowLabel'], '| days:', dg['days'])
print('baseline:', dg['baselineAt'])
print('latest:  ', dg['latestAt'])
if dg['baselineAt']:
    print('ordering ok:', dg['baselineAt'] < dg['latestAt'], '| totalPlays:', dg['totalPlays'], '| tracked:', dg['artistsTracked'])
    for i, a in enumerate(dg['artists'][:6], 1):
        print(f\"  {i}. {a['artistName']}  +{a['delta']}  ({a['total']} all-time){' [new]' if a['isNew'] else ''}\")
"

python3 scripts/digest-db-helper.py clean
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
echo "== done =="
