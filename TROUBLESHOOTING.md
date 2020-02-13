# Where to ask for help

Use #support channel in [Signal K Slack](https://signalk-dev.slack.com/admin) (get an [invite](http://slack-invite.signalk.org/)).

# NMEA 2000 inputs are not working

Get a log of your NMEA2000 bus data with something like `/usr/lib/node_modules/signalk-server/node_modules/canboatjs/bin/actisense-serialjs /dev/ttyUSB0 > /tmp/actisense.log`.

Share the resulting file, preferably via Dropbox, Google Drive, Github Gist or something similar so that you can just share the url.

# Turning On Debug

If the console is available, go to Server -> Server Log and enter the the names of the compononets you want to debug.

Otherwise, you can edit the file `~/.signalk_debug' and add them there. For example: `@signalk/aisreporter,signalk-server:udp-provider`
