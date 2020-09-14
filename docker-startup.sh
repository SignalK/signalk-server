#!/usr/bin/env sh
sudo service dbus start
sudo avahi-daemon --no-chroot &
/home/node/signalk/bin/signalk-server --securityenabled
