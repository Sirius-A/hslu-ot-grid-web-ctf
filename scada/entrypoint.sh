#!/bin/bash
# Runtime setup for the dispatch SCADA: operator account, the emergency
# dispatch key and the field-device credential file that an attacker with code
# execution on this host would find.
set -euo pipefail

SERVER=/usr/src/app/FUXA/server
APPDATA="$SERVER/_appdata"

ADMIN_USER="${FUXA_ADMIN_USER:-admin}"
ADMIN_PASSWORD="${FUXA_ADMIN_PASSWORD:-123456}"
# NB: a `}` inside a ${VAR:-default} closes the expansion early in bash, so the
# fallback flag is assigned separately rather than inline.
FLAG2="${FLAG2:-}"
if [ -z "$FLAG2" ]; then
  FLAG2='HSLU{s2_fux4_run5cr1pt_t35t_m0d3_1s_n0t_4n_4uth_ch3ck}'
fi

mkdir -p /opt/gridops

cat > /opt/gridops/emergency-dispatch-key.txt <<FLAGEOF
GridOps North -- regional load dispatch centre
Emergency dispatch authorisation key (restricted):

$FLAG2

Do not copy outside the control room.
FLAGEOF

cat > /opt/gridops/field-devices.conf <<'CFGEOF'
# Field device connections for the dispatch centre.
# Read by the SCADA runtime at start.
[uw-rotkreuz-rtu]
protocol = iec60870-5-104
host     = 10.42.10.11
port     = 2404
common_address = 1

[seetal-pumpwerk-plc]
protocol = s7
host     = 10.42.12.40
rack     = 0
slot     = 2
service_user = svc-scada
service_password = Pumpwerk!Seetal#2026

[hall-b-compressor]
protocol = modbus-tcp
host     = 10.42.14.7
port     = 502
CFGEOF

chmod 640 /opt/gridops/field-devices.conf

ADMIN_USER="$ADMIN_USER" ADMIN_PASSWORD="$ADMIN_PASSWORD" node -e "
const bcrypt = require('$SERVER/node_modules/bcryptjs');
const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD, 10);
// 'info' is parsed as JSON by FUXA, so it is left NULL like the stock default.
require('fs').writeFileSync('/tmp/_user.sql',
  \"DELETE FROM users;\n\" +
  \"INSERT INTO users (username, fullname, password, groups) VALUES ('\" +
  process.env.ADMIN_USER.replace(/'/g, \"''\") + \"', 'Dispatch Operator', '\" + hash + \"', -1);\n\");
"
sqlite3 "$APPDATA/users.fuxap.db" < /tmp/_user.sql
rm -f /tmp/_user.sql

echo "[gridops] dispatch SCADA starting (operator: $ADMIN_USER)"
cd "$SERVER"
exec npm start
