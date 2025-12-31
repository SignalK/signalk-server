#!/usr/bin/env sh
service dbus restart
/usr/sbin/avahi-daemon -k
/usr/sbin/avahi-daemon --no-drop-root &
service bluetooth restart
/home/node/signalk/node_modules/.bin/signalk-server --securityenabled
