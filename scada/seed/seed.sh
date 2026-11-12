#!/bin/bash
# Build-time seeding: import the dispatch project through FUXA's own API and
# switch the instance into secure mode. The operator account, the flag and the
# field-device credentials are written at container start by entrypoint.sh.
set -euo pipefail

SERVER=/usr/src/app/FUXA/server
APPDATA="$SERVER/_appdata"
SETTINGS="$APPDATA/settings.js"

cd "$SERVER"
echo "[seed] starting FUXA to initialise its databases"
npm start >/tmp/seed-fuxa.log 2>&1 &
FUXA_PID=$!

for _ in $(seq 1 90); do
  curl -sf -o /dev/null http://127.0.0.1:1881/ && break
  sleep 1
done
curl -sf -o /dev/null http://127.0.0.1:1881/ || { echo "[seed] FUXA did not come up"; cat /tmp/seed-fuxa.log; exit 1; }

echo "[seed] importing the dispatch project"
curl -sf -X POST http://127.0.0.1:1881/api/project \
  -H 'content-type: application/json' \
  --data-binary @/seed/project.json > /dev/null
sleep 4

echo "[seed] stopping FUXA"
kill "$FUXA_PID" 2>/dev/null || true
pkill -f 'node main.js' 2>/dev/null || true
sleep 3

echo "[seed] enabling secure mode"
sed -i "s|^    //secureEnabled: true,|    secureEnabled: true,|" "$SETTINGS"
sed -i "s|^    //secretCode: .*|    secretCode: '$(head -c 18 /dev/urandom | od -An -tx1 | tr -d ' \n')',|" "$SETTINGS"

grep -q '^    secureEnabled: true,' "$SETTINGS" || { echo "[seed] secure mode patch failed"; exit 1; }
test "$(sqlite3 "$APPDATA/project.fuxap.db" 'select count(*) from scripts;')" = "2" \
  || { echo "[seed] project scripts missing"; exit 1; }
test "$(sqlite3 "$APPDATA/project.fuxap.db" 'select count(*) from views;')" = "1" \
  || { echo "[seed] project view missing"; exit 1; }

echo "[seed] done"
