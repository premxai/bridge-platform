#!/usr/bin/env bash
# Reset everything for another demo run (Git Bash, from the platform folder):
#   bash scripts/reset-demo.sh
# 1. Heals faults, clears the incident and counters, stops simulated shoppers.
# 2. Restores ShieldCo's pre-incident parser (v1 dollars only) as a visible
#    "Demo reset" commit and redeploys ShieldCo's Freestyle VM, so the bug can be found again.
# 3. Clears old messages from each agent's inbox.
set -u
here="$(cd "$(dirname "$0")/../.." && pwd)"
PRE_INCIDENT=b0a2464   # ShieldCo commit before the agents' fix

curl -s -X POST localhost:3000/control/reset -H 'content-type: application/json' -d '{}' >/dev/null
curl -s -X POST localhost:3000/control/traffic -H 'content-type: application/json' -d '{"mode":"off"}' >/dev/null
echo "platform: faults healed, counters cleared, shoppers off"

cd "$here/shieldco"
git checkout -q main && git pull -q --ff-only
if git diff --quiet "$PRE_INCIDENT" -- src/contract.ts test/contract.test.ts; then
  echo "shieldco: parser already at pre-incident version"
else
  git checkout "$PRE_INCIDENT" -- src/contract.ts test/contract.test.ts
  git commit -q -m "Demo reset: restore pre-incident fraud-check parser" -- src/contract.ts test/contract.test.ts
  git push -q
  echo "shieldco: restored pre-incident parser ($(git log --oneline -1))"
fi
npm run --silent deploy | tail -1

for r in shopco payflow shieldco; do
  (cd "$here/$r" && npm run --silent relay:wait -- --seconds 4 >/dev/null 2>&1)
done
echo "agent inboxes cleared. Ready for a new run."
