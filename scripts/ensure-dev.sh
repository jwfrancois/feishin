#!/bin/bash
# Ensure a Next.js dev server is answering on port 3000 (respawn if the
# sandbox reaper killed it). Bounded wait; exits 0 only when ready.
cd /home/z/my-project || exit 1
LOG=.zscripts/dev.log

check() { curl -s -o /dev/null -m 2 http://localhost:3000/; }

if check; then
  echo "[ensure-dev] server ready"
  exit 0
fi

# clean leftovers, respawn
pkill -9 -f "next dev" 2>/dev/null
pkill -9 -f "next-server" 2>/dev/null
pkill -9 -f "dev-watchdog" 2>/dev/null
sleep 1
echo "[ensure-dev $(date '+%H:%M:%S')] respawning..." >> "$LOG"
setsid nohup bun run dev >> "$LOG" 2>&1 < /dev/null &
disown 2>/dev/null || true

for i in $(seq 1 45); do
  sleep 2
  if check; then
    echo "[ensure-dev] ready after ~$((i * 2))s"
    exit 0
  fi
done
echo "[ensure-dev] FAILED to become ready"
exit 1
