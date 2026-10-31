#!/bin/sh
# The radar is mayara's emulator, following the simulated boat and showing
# its AIS traffic and the ENC's land. --parent stops it with the server,
# which takes over this shell's process.
SERVER_PID=$$

# Visitors may only watch, so they cannot change the range: open the radar
# at 3 nm, where the coast around the boat shows.
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
}

# Fly only watches the server's port, so a radar that exits is restarted here.
(
  while kill -0 "$SERVER_PID" 2>/dev/null; do
    mayara-server --emulator --emulator-land /home/node/.signalk/mayara/land.geojson \
      --no-mdns -n ws:127.0.0.1:3000 --parent "$SERVER_PID" &
    MAYARA_PID=$!
    set_radar_range "$MAYARA_PID"
    wait "$MAYARA_PID"
    sleep "$RESTART_DELAY_SECONDS"
  done
) &

exec /home/node/signalk/node_modules/signalk-server/bin/signalk-server --securityenabled
