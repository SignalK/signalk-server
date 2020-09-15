#!/usr/bin/env sh
sudo service dbus start
sudo avahi-daemon --no-chroot &
sudo service avahi-daemon restart
/home/node/signalk/bin/signalk-server --securityenabled
