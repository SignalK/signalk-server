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

# Set IS_IN_DOCKER for Admin UI (disables "Update Server" button in container)
export IS_IN_DOCKER=true

# The server is installed locally (not at a system path), so enable the
# update check explicitly. This restores the footer "new version
# available" notice; the self-update button stays hidden via IS_IN_DOCKER.
export SIGNALK_SERVER_IS_UPDATABLE=true

# mDNS / D-Bus setup.
#
# Use the HOST's avahi (and don't run our own responder) when it is reachable.
# This is the right setup on a host that already runs avahi (e.g. Raspberry Pi
# OS) under network_mode: host — the container resolves .local names via
# libnss-mdns talking to the host avahi. Two ways the host avahi is exposed:
#   - the host D-Bus system socket is mounted and answering
#     (-v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro); common
#     on Docker.
#   - the host avahi socket is mounted (-v /run/avahi-daemon/socket:...);
#     libnss-mdns talks to it directly. Common on rootless podman, where the
#     D-Bus EXTERNAL handshake needs --userns=keep-id to match peer creds.
#
# Otherwise start our own D-Bus + Avahi. This is correct for bridge mode (an
# isolated network namespace). Under network_mode: host on a host that already
# runs avahi WITHOUT either socket mounted, our avahi-daemon detects the other
# mDNS stack and exits or runs degraded — so .local lookups fail (EAI_AGAIN).
# We detect that ("Detected another ... mDNS stack"), stop our daemon so we
# don't degrade the host's mDNS, and tell the user how to fix it.
if [ -S /run/dbus/system_bus_socket ]; then
    # A host D-Bus socket is mounted — do not start our own D-Bus (that would
    # restart against the mounted host socket). Use the host's avahi if it is
    # registered on that bus; otherwise warn rather than silently leaving no
    # resolver.
    if dbus-send --system --reply-timeout=3000 --dest=org.freedesktop.DBus --print-reply /org/freedesktop/DBus org.freedesktop.DBus.ListNames 2>/dev/null | grep -q org.freedesktop.Avahi; then
        echo "Using host D-Bus (socket mounted from host)"
    else
        echo "WARNING: host D-Bus is mounted but Avahi is not registered on it,"
        echo "so .local names will not resolve. Start avahi on the host, or"
        echo "remove the host D-Bus mount to run a container-local responder."
    fi
elif [ -S /run/avahi-daemon/socket ]; then
    echo "Using host Avahi (socket mounted from host)"
else
    echo "Starting container D-Bus and Avahi services"
    service dbus restart
    /usr/sbin/avahi-daemon -k 2>/dev/null
    avahi_log=$(mktemp)
    /usr/sbin/avahi-daemon --no-drop-root >"$avahi_log" 2>&1 &
    avahi_pid=$!
    service bluetooth restart
    # Under network_mode: host on a host that already runs avahi, our
    # avahi-daemon detects the other responder (it logs "Detected another ...
    # mDNS stack") and then either exits or runs degraded — either way it
    # registers wrong addresses and makes mDNS unreliable, and .local lookups
    # from inside the container fail. Detect that marker, stop our daemon so we
    # don't degrade the host's mDNS, and point the user at the fix.
    # Poll briefly rather than a single fixed wait: the conflict line can take
    # a moment to appear, and a clean start logs "Server startup complete".
    i=0
    while [ "$i" -lt 10 ]; do
        grep -q "Detected another" "$avahi_log" 2>/dev/null && break
        grep -q "Server startup complete" "$avahi_log" 2>/dev/null && break
        ! kill -0 "$avahi_pid" 2>/dev/null && break
        sleep 0.5
        i=$((i + 1))
    done
    if grep -q "Detected another" "$avahi_log" 2>/dev/null; then
        kill "$avahi_pid" 2>/dev/null
        /usr/sbin/avahi-daemon -k 2>/dev/null
        echo "WARNING: this host already runs an mDNS responder (avahi) and the"
        echo "container shares its network (network_mode: host), so it cannot run"
        echo "its own. .local name resolution will not work from inside the"
        echo "container until you let it use the host's avahi:"
        echo "  - Docker:         mount the host D-Bus system socket"
        echo "                      -v /run/dbus/system_bus_socket:/run/dbus/system_bus_socket:ro"
        echo "  - rootless podman: run with --userns=keep-id and mount the avahi"
        echo "                    socket -v /run/avahi-daemon/socket:/run/avahi-daemon/socket"
    elif ! kill -0 "$avahi_pid" 2>/dev/null; then
        echo "WARNING: avahi-daemon exited during startup; .local name resolution"
        echo "may not work. Check the container logs for details."
    fi
    rm -f "$avahi_log"
fi

exec /home/node/signalk/node_modules/signalk-server/bin/signalk-server --securityenabled "$@"
