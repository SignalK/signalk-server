#!/usr/bin/env sh

# Check if host D-Bus socket is mounted (rootless container scenario)
# If mounted, we use the host's D-Bus/Avahi instead of starting our own
if [ -S /run/dbus/system_bus_socket ] && dbus-send --system --dest=org.freedesktop.DBus --print-reply /org/freedesktop/DBus org.freedesktop.DBus.ListNames >/dev/null 2>&1; then
    echo "Using host D-Bus (socket mounted from host)"
else
    echo "Starting container D-Bus and Avahi services"
    service dbus restart
    /usr/sbin/avahi-daemon -k 2>/dev/null
    /usr/sbin/avahi-daemon --no-drop-root &
    service bluetooth restart
fi

/home/node/signalk/node_modules/.bin/signalk-server --securityenabled
