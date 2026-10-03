#!/bin/bash
# Resilient asset generator - retries until completion (audio files are skipped if they exist)
cd /home/z/my-project
for i in $(seq 1 40); do
  echo "=== ATTEMPT $i ===" >> scripts/gen.log
  python3 -u scripts/generate_assets.py >> scripts/gen.log 2>&1
  code=$?
  if [ $code -eq 0 ] && grep -q "^DONE" scripts/gen.log; then
    echo "=== COMPLETED ===" >> scripts/gen.log
    break
  fi
  echo "=== exited $code, retrying ===" >> scripts/gen.log
  sleep 1
done
