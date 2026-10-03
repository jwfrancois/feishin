#!/bin/bash
# Full digest + Auto-EQ preset-mapping verification, then restore clean state.
# 1. inspect today's real snapshot
# 2. seed a synthetic baseline batch 3 days back (marked, deleted afterwards)
# 3. GET digest -> expect status=ready + ranked artists
# 4. probe sound-profile for jazz / edm genre sets -> expect mapped presetId
# 5. delete synthetic batch + test findings  -> back to 1 real snapshot day
cd /home/z/my-project
DB=db/custom.db

echo "== today's real snapshot =="
python3 -c "
import sqlite3
con = sqlite3.connect('$DB')
print('rows:', con.execute('SELECT COUNT(*) FROM PlaySnapshot').fetchone()[0])
for r in con.execute('SELECT artistName, playCount FROM PlaySnapshot ORDER BY playCount DESC LIMIT 5'):
    print('  ', r)
"

setsid nohup bun run dev >/dev/null 2>&1 < /dev/null & disown
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code}" -m 5 http://localhost:3000/ 2>/dev/null | grep -q 200 && break; sleep 2; done
echo "== server up =="

echo "== seed synthetic baseline (3 days ago) =="
BASE_TS=$(python3 -c "from datetime import datetime,timedelta,timezone; print((datetime.now(timezone.utc)-timedelta(days=3)).isoformat())")
python3 - <<EOF
import sqlite3, datetime
con = sqlite3.connect('$DB')
base = datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=3)
rows = con.execute("SELECT artistKey, artistName, artistId, playCount, trackCount FROM PlaySnapshot ORDER BY playCount DESC LIMIT 40").fetchall()
data = []
for k, name, aid, pc, tc in rows:
    cut = max(0, pc - (1 + (pc * 7 % 5)))  # deterministic 1-5 play delta
    data.append((base.isoformat(), 'artist', k, name, aid, cut, max(0, tc - 1)))
# two artists unique to today so isNew gets exercised
data.append((base.isoformat(), 'artist', 'zzz-test-only-artist-a', 'ZZZ Test Only A', '', 0, 0))
con.executemany("INSERT INTO PlaySnapshot (id, takenAt, level, artistKey, artistName, artistId, playCount, trackCount) VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)", data)
con.commit()
print('seeded', len(data), 'baseline rows @', base.isoformat())
EOF

echo "== GET digest (expect ready) =="
curl -s -m 30 http://localhost:3000/api/agent/digest | python3 -c "
import json,sys
d = json.load(sys.stdin)
dg = d['digest']
print('status:', dg['status'], '|', dg['windowLabel'], '| days:', dg['days'])
print('baseline:', dg['baselineAt'], '-> latest:', dg['latestAt'])
print('totalPlays:', dg['totalPlays'], '| tracked:', dg['artistsTracked'])
for i, a in enumerate(dg['artists'][:8], 1):
    print(f\"  {i}. {a['artistName']}  +{a['delta']}  ({a['total']} all-time){' [new]' if a['isNew'] else ''}\")
"

echo "== Auto-EQ preset mapping probes =="
for g in "jazz,vocal jazz" "edm,electro house" "reggae,dub" "metal,thrash"; do
  ID="probe$(echo $g | md5sum | cut -c1-10)"
  curl -s -m 45 "http://localhost:3000/api/agent/sound-profile/$ID?itemType=track&name=Probe&artist=Probe%20Artist&genres=$(python3 -c "import urllib.parse,sys;print(urllib.parse.quote('$g'))")&refresh=1" | python3 -c "
import json,sys
d = json.load(sys.stdin)
p = d.get('profile', {})
print(f\"  genres='$g' -> topClass={p.get('topClass')} presetId={p.get('presetId')} presetName={p.get('presetName')} conf={p.get('confidence')}\")
"
done

echo "== cleanup synthetic baseline + probe findings =="
python3 - <<EOF
import sqlite3
con = sqlite3.connect('$DB')
n1 = con.execute("DELETE FROM PlaySnapshot WHERE artistKey LIKE 'zzz-test-only%' OR artistKey IN (SELECT artistKey FROM PlaySnapshot WHERE takenAt < datetime('now','-1 day'))").rowcount
n2 = con.execute("DELETE FROM AgentFinding WHERE itemId LIKE 'probe%'").rowcount
con.commit()
print('deleted synthetic rows:', n1, '| probe findings:', n2)
print('remaining snapshot rows:', con.execute('SELECT COUNT(*) FROM PlaySnapshot').fetchone()[0])
print('distinct batch days:', con.execute(\"SELECT COUNT(DISTINCT date(takenAt)) FROM PlaySnapshot\").fetchone()[0])
EOF

curl -s -m 20 http://localhost:3000/api/agent/digest | python3 -c "
import json,sys; dg = json.load(sys.stdin)['digest']
print('final digest status:', dg['status'], '| snapshotDays:', dg['snapshotDays'])"
pkill -f "next dev" 2>/dev/null; pkill -f "next-server" 2>/dev/null
echo "== done =="
