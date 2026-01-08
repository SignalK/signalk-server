#!/usr/bin/env sh

# Detect container runtime (only if not already set by user)
if [ -z "$CONTAINER_RUNTIME" ]; then
    # File-based detection (most reliable)
    if [ -f /.dockerenv ]; then
        export CONTAINER_RUNTIME="docker"
    elif [ -f /run/.containerenv ]; then
        export CONTAINER_RUNTIME="podman"
    elif [ -n "$KUBERNETES_SERVICE_HOST" ]; then
        # Kubernetes sets this environment variable
        export CONTAINER_RUNTIME="kubernetes"
    else
        # Fallback: check cgroups and other markers
        if [ -f /proc/1/cgroup ]; then
            if grep -q '/docker' /proc/1/cgroup 2>/dev/null; then
                export CONTAINER_RUNTIME="docker"
            elif grep -q '/libpod' /proc/1/cgroup 2>/dev/null; then
                export CONTAINER_RUNTIME="podman"
            elif grep -q '/kubepods' /proc/1/cgroup 2>/dev/null; then
                export CONTAINER_RUNTIME="kubernetes"
            elif grep -q '/lxc' /proc/1/cgroup 2>/dev/null; then
                export CONTAINER_RUNTIME="lxc"
            elif grep -q '/containerd' /proc/1/cgroup 2>/dev/null; then
                export CONTAINER_RUNTIME="containerd"
            fi
        fi

        # Additional checks for CRI-O and other runtimes
        if [ -z "$CONTAINER_RUNTIME" ]; then
            if [ -d /var/run/crio ]; then
                export CONTAINER_RUNTIME="crio"
            elif [ -S /var/run/containerd/containerd.sock ]; then
                export CONTAINER_RUNTIME="containerd"
            fi
        fi
    fi
fi

# IS_IN_DOCKER is already set in Dockerfile for backward compatibility
# No need to set it here - it's always true in containers

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
