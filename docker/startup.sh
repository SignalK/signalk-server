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

exec /home/node/signalk/node_modules/signalk-server/bin/signalk-server --securityenabled "$@"
