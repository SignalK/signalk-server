---
title: Programs as a Data Source
---

# Using your own program as a data source

Signal K Server can start a program of your own and read Signal K data from its standard output. This is a quick way to bring in a sensor that has no plugin or NMEA interface yet, for example a small program that talks to a Bluetooth or I2C device.

The Admin UI has no option for this kind of connection, so it is added to `settings.json` by hand.

## What the program has to print

The program writes one Signal K [delta](https://signalk.org/specification/1.7.0/doc/data_model.html#delta-format) per line to standard output, as JSON on a single line:

```text
{"updates":[{"values":[{"path":"environment.wind.speedApparent","value":5.2},{"path":"environment.wind.angleApparent","value":0.61}]}]}
```

- Values are in SI units: m/s for speed, radians for angles, Kelvin for temperature and so on.
- `context` can be left out. The delta is then applied to your own vessel.
- `source` and `timestamp` can be left out too. The server uses the connection's `id` as the source and the time it received the line as the timestamp.
- Lines that are not valid JSON are logged and skipped.
- Anything the program writes to standard error is shown as an error for the connection on the Dashboard and in the server log.

If the program exits, the server starts it again, at most once a minute.

## Adding the connection to settings.json

`settings.json` is in the server's configuration directory, by default `~/.signalk`. Stop the server before editing it: the server writes this file itself, so changes made while it is running can be overwritten.

Add an entry to the `pipedProviders` array and leave the rest of the file as it is:

```json
{
  "id": "wind-sensor",
  "enabled": true,
  "pipeElements": [
    {
      "type": "providers/execute",
      "options": {
        "command": "/home/pi/bin/wind-sensor --port /dev/ttyUSB1"
      }
    },
    {
      "type": "providers/liner"
    },
    {
      "type": "providers/from_json"
    }
  ]
}
```

- `id` names the connection and is the source shown for its data.
- `command` is run with `sh -c`, so it can include arguments. Use an absolute path, and make sure the user the server runs as can execute the program.
- `restartOnClose` (default `true`) and `restartThrottleTime` (seconds between restarts, default `60`) can be added to the `providers/execute` options.

Start the server again. The connection appears on the Dashboard and under _Server -> Data Connections_, where it is shown read only and can be deleted. Its data shows up in the _Data Browser_ with the `id` as the source.

To check the setup before your own program is ready, use a shell loop as the command:

```json
"command": "while true; do echo '{\"updates\":[{\"values\":[{\"path\":\"environment.outside.pressure\",\"value\":101300}]}]}'; sleep 1; done"
```

## Running the server in a container

When the server runs in Docker or Podman, the command is run inside the container. The program must be reachable from inside it, for example in a directory under the mounted configuration directory, and it must be built for the container's CPU architecture and C library. Devices such as serial ports or Bluetooth also have to be passed into the container.

## The example settings files

The `settings/` directory of the server's source contains example files such as `commandline-provider-settings.json`. These are complete settings files, used with the `-s` option by the scripts in `bin/` of a source checkout. Copying one into the configuration directory has no effect, because the server only reads `settings.json` there. Copy the provider entry from it into `settings.json` instead.
