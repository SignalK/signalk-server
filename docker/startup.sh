#!/usr/bin/env sh
service dbus restart
/usr/sbin/avahi-daemon -k
/usr/sbin/avahi-daemon --no-drop-root &
/usr/bin/pm2-docker './../bin/signalk-server --securityenabled'