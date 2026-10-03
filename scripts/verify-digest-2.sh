#!/bin/bash
# Round 2: clean state -> seed baseline -> verify ready digest ordering -> clean.
cd /home/z/my-project
python3 scripts/digest-db-helper.py clean
python3 scripts/digest-db-helper.py seed

setsid nohup bun run dev >/dev/null 2>&1 < /dev/null & disown
for i in $(seq 1 30); do curl -s -o /dev/null -m 5 http://localhost:3000/ 2>/dev/null | grep -q . && break; sleep 2; done
for i in $(seq 1 20); do [ "$(curl -s -o /dev/null -w '%{http_code}' -m 5 http://localhost:3000/)" = "200" ] && break; sleep 2; done
echo "server ready"

echo "== GET digest (expect ready, baseline < latest, positive deltas) =="
curl -s -m 30 http://localhost:3000/api/agent/digest | python3 -c "
import json,sys
d = json.load(sys.stdin)
dg = d['digest']
print('status:', dg['status'], '|', dg['windowLabel'], '| days:', dg['days'])
print('baseline:', dg['baselineAt'])
print('latest:  ', dg['latestAt'])
ok_order = dg['baselineAt'] < dg['latestAt']
print('ordering ok:', ok_order, '| totalPlays:', dg['totalPlays'], '| tracked:', dg['artistsTracked'])
for i, a in enumerate(dg['artists'][:6], 1):
    print(f\"  {i}. {a['artistName']}  +{a['delta']}  ({a['total']} all-time){' [new]' if a['isNew'] else ''}\")
"

echo "== Hi-Fi preset catalog sanity (grouped dropdown data) =="
node -e "
const ts = require('fs').readFileSync('src/lib/audio/eq-presets.ts','utf8');
const ids = [...ts.matchAll(/P\(\"([a-z]+)\"/g)].map(m=>m[1]);
console.log('presets:', ids.length, '| unique:', new Set(ids).size);
"

python3 scripts/digest-db-helper.py clean
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
echo "== final state cleaned, server stopped =="
