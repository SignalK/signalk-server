#!/usr/bin/env sh
service dbus restart
/home/node/signalk/avahi/avahi.sh
/home/node/signalk/bin/signalk-server --securityenabled
