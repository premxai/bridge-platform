#!/usr/bin/env bash
# Start the three company services and the platform in the background (Git Bash).
# Logs: platform/logs/<name>.log. Stop everything with: powershell -File scripts/stop-all.ps1
set -u
here="$(cd "$(dirname "$0")/../.." && pwd)"
mkdir -p "$here/platform/logs"
for svc in shopco payflow shieldco platform; do
  (cd "$here/$svc" && nohup tsx src/server.ts > "$here/platform/logs/$svc.log" 2>&1 &)
done
sleep 4
for port in 4001 4002 4003 3000; do
  if curl -s -o /dev/null "http://localhost:$port/health" || curl -s -o /dev/null "http://localhost:$port/"; then echo "port $port: up"; else echo "port $port: DOWN"; fi
done
