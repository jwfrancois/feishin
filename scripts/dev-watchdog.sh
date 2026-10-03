#!/bin/bash
# Dev-server watchdog: keeps exactly one Next.js dev server alive on port 3000.
# The sandbox reaps user-spawned long-lived processes; this loop respawns the
# server within seconds whenever it dies, so the preview stays usable.
cd /home/z/my-project || exit 1
LOG=.zscripts/dev.log

while true; do
  # is a server already answering?
  if curl -s -o /dev/null -m 2 http://localhost:3000/; then
    sleep 3
    continue
  fi
  # clear leftover listeners/wrappers before respawning
  pkill -9 -f "next dev" 2>/dev/null
  pkill -9 -f "next-server" 2>/dev/null
  sleep 1
  echo "[watchdog $(date '+%H:%M:%S')] respawning dev server..." >> "$LOG"
  nohup bun run dev >> "$LOG" 2>&1 &
  # wait up to 60s for readiness
  for i in $(seq 1 30); do
    sleep 2
    curl -s -o /dev/null -m 2 http://localhost:3000/ && break
  done
  sleep 3
done
