# Where to ask for help

Use #support channel in [Signal K Slack](https://signalk-dev.slack.com/admin) (get an [invite](http://slack-invite.signalk.org/)).

# NMEA 2000 inputs are not working

Get a log of your NMEA2000 bus data with something like `/usr/lib/node_modules/signalk-server/node_modules/canboatjs/bin/actisense-serialjs /dev/ttyUSB0 > /tmp/actisense.log`.

Share the resulting file, preferably via Dropbox, Google Drive, Github Gist or something similar so that you can just share the url.

# Turning On Debug

Debug logging can be turned on for many features of the node server. If you need to turn debugging on, modify `~/.signalk/signalk-server` and add the DEBUG variable as below.

```
#!/bin/sh
export DEBUG="@signalk/aisreporter,signalk-server:udp-provider"
/usr/lib/node_modules/signalk-server/bin/signalk-server -c /home/pi/.signalk $*
```
