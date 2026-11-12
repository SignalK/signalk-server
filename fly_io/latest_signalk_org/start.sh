#!/bin/sh
# A Fly volume mounts as root. Hand the history directory to node and go on
# as node; without a volume it is a plain directory in the image.
HISTORY_DIR=/home/node/history
if [ "$(id -u)" = 0 ]; then
  mkdir -p "$HISTORY_DIR"
  chown node:node "$HISTORY_DIR"
  export HOME=/home/node
  exec setpriv --reuid=node --regid=node --init-groups "$0" "$@"
fi

# A machine stopped mid-write can leave the history buffer malformed, and
# signalk-parquet then drops every new value. Set such a buffer aside, so
# recording starts again with an empty one.
BUFFER_DB="$HISTORY_DIR/buffer.db"
if [ -f "$BUFFER_DB" ] && ! node -e '
  const { DatabaseSync } = require("node:sqlite")
  const db = new DatabaseSync(process.argv[1])
  const [result] = Object.values(db.prepare("PRAGMA quick_check").get())
  process.exit(result === "ok" ? 0 : 1)
' "$BUFFER_DB" 2>/dev/null; then
  ASIDE="$BUFFER_DB.malformed-$(date -u +%Y%m%dT%H%M%SZ)"
  echo "History buffer is malformed, setting it aside as $ASIDE"
  for f in "$BUFFER_DB" "$BUFFER_DB-wal" "$BUFFER_DB-shm"; do
    [ -f "$f" ] && mv "$f" "$ASIDE${f#"$BUFFER_DB"}"
  done
fi

# The radar is mayara's emulator, following the simulated boat and showing
# its AIS traffic and the ENC's land, buoys and beacons. --parent stops it
# with the server, which takes over this shell's process.
SERVER_PID=$$

# Visitors may only watch, so they cannot change the range: open the radar
# at 3 nm, close enough to see the boat and the traffic around it.
RADAR_RANGE_METERS=5556
RESTART_DELAY_SECONDS=5

set_radar_range() {
  for _ in $(seq 60); do
    kill -0 "$1" 2>/dev/null || return
    curl -sf --max-time 5 -X PUT -H 'Content-Type: application/json' \
      -d "{\"value\":$RADAR_RANGE_METERS}" \
      http://127.0.0.1:6502/signalk/v2/api/vessels/self/radars/emu0001/controls/range \
      >/dev/null && return
    sleep 2
  done
  return 1
}

# Fly only watches the server's port, so a radar that exits is restarted here.
(
  while kill -0 "$SERVER_PID" 2>/dev/null; do
    mayara-server --emulator --emulator-land /home/node/.signalk/mayara/land.geojson \
      --emulator-marks /home/node/.signalk/mayara/marks.geojson \
      --no-mdns -n ws:127.0.0.1:3000 --parent "$SERVER_PID" &
    MAYARA_PID=$!
    if ! set_radar_range "$MAYARA_PID"; then
      kill "$MAYARA_PID" 2>/dev/null || :
    fi
    wait "$MAYARA_PID"
    sleep "$RESTART_DELAY_SECONDS"
  done
) &

exec /home/node/signalk/node_modules/signalk-server/bin/signalk-server --securityenabled
