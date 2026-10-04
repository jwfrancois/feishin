#!/usr/bin/env python3
"""DB helper for digest verification: seed / clean synthetic batches + probe findings.
NOTE: Prisma stores DateTime as epoch-millis INTEGER in SQLite — compare integers."""
import sqlite3
import sys
from datetime import datetime, timezone

DB = "/home/z/my-project/db/custom.db"
MARK = "zzz-test-only-artist"
DAY_MS = 86_400_000


def seed():
    con = sqlite3.connect(DB)
    # baseline goes 3 days before the NEWEST real batch
    row = con.execute("SELECT MAX(takenAt) FROM PlaySnapshot WHERE artistKey NOT LIKE ?", (MARK + "%",)).fetchone()
    if not row or not row[0]:
        print("no real snapshot to seed from — take one first")
        return
    latest_ms = row[0]
    base_ms = latest_ms - 3 * DAY_MS
    src = con.execute(
        "SELECT artistKey, artistName, artistId, playCount, trackCount FROM PlaySnapshot WHERE takenAt=? ORDER BY playCount DESC LIMIT 40",
        (latest_ms,),
    ).fetchall()
    data = []
    for k, name, aid, pc, tc in src:
        cut = max(0, pc - (1 + (pc * 7) % 5))  # deterministic 1-5 play drop
        data.append((base_ms, "artist", k, name, aid, cut, max(0, tc - 1)))
    data.append((base_ms, "artist", MARK + "-a", "ZZZ Test Only A", "", 0, 0))
    con.executemany(
        "INSERT INTO PlaySnapshot (id, takenAt, level, artistKey, artistName, artistId, playCount, trackCount) "
        "VALUES (lower(hex(randomblob(16))), ?, ?, ?, ?, ?, ?, ?)",
        data,
    )
    con.commit()
    fmt = lambda ms: datetime.fromtimestamp(ms / 1000, timezone.utc).isoformat()
    print(f"seeded {len(data)} baseline rows @ {fmt(base_ms)} (real batch {fmt(latest_ms)} kept)")


def clean():
    con = sqlite3.connect(DB)
    # keep only the newest real batch
    row = con.execute("SELECT MAX(takenAt) FROM PlaySnapshot WHERE artistKey NOT LIKE ?", (MARK + "%",)).fetchone()
    keep_ms = row[0] if row and row[0] else 0
    n1 = con.execute("DELETE FROM PlaySnapshot WHERE takenAt < ?", (keep_ms,)).rowcount
    n2 = con.execute("DELETE FROM AgentFinding WHERE itemId LIKE 'probe%'").rowcount
    n3 = con.execute(
        "UPDATE AgentRun SET status='failed', error='interrupted (server restart) - superseded' WHERE jobType='digest' AND status='running'"
    ).rowcount
    con.commit()
    left = con.execute("SELECT COUNT(*) FROM PlaySnapshot").fetchone()[0]
    batches = con.execute("SELECT COUNT(DISTINCT takenAt) FROM PlaySnapshot").fetchone()[0]
    print(f"deleted synthetic: {n1} | probe findings: {n2} | stuck runs: {n3}")
    print(f"remaining snapshot rows: {left} | distinct batches: {batches}")


if __name__ == "__main__":
    {"seed": seed, "clean": clean}[sys.argv[1]]()
