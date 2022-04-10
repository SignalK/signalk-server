
## Please see [Releases](https://github.com/SignalK/signalk-server-node/releases) for the release notes.

## Feature: option adjustTimestamp in timestamp-throttle piped provider element
Piped provider element `timestamp-throttle` now has option `adjustTimestamp` to "adjust" the timestamp of messages as it plays them back.  When enabled, it calculates the difference between the recorded timestamp in the first message and system time at that moment and adds that difference to the timestamp in all messages.  This makes the playback appear to be happening in real time.

To enable, in your `settings.json`:

```json
. . .
"pipeElements": [
. . .
  {
    "type": "providers/timestamp-throttle",
    "options": {
        "adjustTimestamp": true
    }
  },
. . .
]
. . .
```
See `settings/n2k-from-file-settings-adjust-timestamp.json` for an example.
