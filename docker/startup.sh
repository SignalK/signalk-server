#!/usr/bin/env sh
service dbus restart
/usr/sbin/avahi-daemon -k
/usr/sbin/avahi-daemon --no-drop-root &
/root/signalk/bin/signalk-server --securityenabled
