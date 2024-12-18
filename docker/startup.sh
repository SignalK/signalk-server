#!/usr/bin/env sh
service dbus restart
/usr/sbin/avahi-daemon -k
/usr/sbin/avahi-daemon --no-drop-root &
service bluetooth restart
/usr/lib/node_modules/signalk-server/bin/signalk-server --securityenabled
