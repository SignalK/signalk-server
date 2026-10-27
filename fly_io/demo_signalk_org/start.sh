#!/bin/sh
# The radar is mayara's emulator, following the simulated boat and showing
# its AIS traffic and the ENC's land. --parent stops it with the server,
# which takes over this shell's process.
mayara-server --emulator --emulator-land /home/node/.signalk/mayara/land.geojson \
  --no-mdns -n ws:127.0.0.1:3000 --parent $$ &

# Visitors may only watch, so they cannot change the range: open the radar
# at 3 nm, where the coast around the boat shows.
RADAR_RANGE_METERS=5556
(
  for _ in $(seq 60); do
    curl -sf -X PUT -H 'Content-Type: application/json' \
      -d "{\"value\":$RADAR_RANGE_METERS}" \
      http://127.0.0.1:6502/signalk/v2/api/vessels/self/radars/emu0001/controls/range \
      >/dev/null && break
    sleep 2
  done
) &

exec /home/node/signalk/node_modules/signalk-server/bin/signalk-server --securityenabled
