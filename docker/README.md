# General

Release process first publishes the server's modules to npm. Docker images are then built using the just published npm packages. Images (including older versions) are available at [Docker Hub](https://hub.docker.com/r/signalk/signalk-server) and starting from v2 at [GitHub Container registry](https://github.com/orgs/SignalK/packages/container/package/signalk-server). Going forward **use the full image name, including the registry cr.signalk.io**. That address will be updated to redirect to the recommended registry where the latest released version can be found.

Release images:

- cr.signalk.io/signalk/signalk-server:latest
- cr.signalk.io/signalk/signalk-server:`<release tag>`, e.g. `v2.16.0`

## Docker Images based on Ubuntu 24.04 LTS

### Node.js 22.x

**Image tag:** `v2.16.0` (example version)

**Supported architectures:**

- `linux/amd64`
- `linux/arm64`
- `linux/arm/v7`

### Node.js 24.x

**Image tag:** `v2.16.0-24.x` (example version with suffix -24.x)

**Supported architectures:**

- `linux/amd64`
- `linux/arm64`

**Not supported:**

- `linux/arm/v7`

### Important Note

Node.js version 24.x dropped support for the `linux/arm/v7` (ARMv7) architecture. This affects older hardware, particularly early Raspberry Pi models:

**Affected devices:**

- Raspberry Pi Model A and B (original)
- Raspberry Pi Zero (original)
- Raspberry Pi 2 Model B v1.1 (with BCM2836 processor)

**Recommendation:** If you're using any of the affected devices, use the Node.js 22.x images instead of 24.x to maintain compatibility.

# Quickstart

You can start a local server on port 3000 with demo data with

```
docker run --init -it --rm --name signalk-server --publish 3000:3000 --entrypoint /home/node/signalk/node_modules/.bin/signalk-server cr.signalk.io/signalk/signalk-server --sample-nmea0183-data
```

For real use you need to persist /home/node/.signalk where the server's configuration is stored, with for example

```
docker run -d --init  --name signalk-server -p 3000:3000 -v $(pwd):/home/node/.signalk cr.signalk.io/signalk/signalk-server
```

This will run the server as background process and current directory as the settings directory. You will be prompted to create admin credentials the first time you you access the configuration admin web UI.

## Docker Compose

See `docker/docker-compose.yml` for reference / example if you want to use docker-compose.

# Image details and used tags

Signal K Server docker images are based on Ubuntu 24.04 LTS. During build process, Node.js is installed including tools required to install or compile plugins. Signal K supports mDNS from docker, uses avahi for e.g. mDNS discovery. All required avahi tools and settings are available for user `node`, also from command line.

## Directory structure

- server files: `/home/node/signalk/` (local npm install)
- settings files and plugins: `/home/node/.signalk/`

You most probably want to mount `/home/node/.signalk` from the host or as a volume to persist your settings.

**Note:** Signal K Server is installed locally (not globally with `npm -g`) in `/home/node/signalk/node_modules/`. This avoids permission issues when installing plugins and provides better isolation.

## Container Runtime Detection

The server automatically detects which container runtime is being used and sets the `CONTAINER_RUNTIME` environment variable accordingly. This enables plugins and addons to adapt their behavior based on the actual runtime environment.

### Supported Runtimes

The following container runtimes are automatically detected:

- **`docker`** - Docker Engine (most common)
- **`podman`** - Podman (rootless and rootful)
- **`kubernetes`** - Kubernetes (any container runtime orchestrated by K8s)
- **`containerd`** - containerd (standalone or via Docker)
- **`crio`** - CRI-O (common in Kubernetes environments)
- **`lxc`** - LXC/LXD containers

### Detection Methods

Detection uses multiple methods in priority order:

1. **File markers** (most reliable):
   - `/.dockerenv` → detects Docker
   - `/run/.containerenv` → detects Podman

2. **Environment variables**:
   - `$KUBERNETES_SERVICE_HOST` → detects Kubernetes

3. **cgroup patterns** (fallback):
   - `/docker`, `/libpod`, `/kubepods`, `/lxc`, `/containerd` in `/proc/1/cgroup`

4. **Runtime sockets** (additional check):
   - `/var/run/crio` → detects CRI-O
   - `/var/run/containerd/containerd.sock` → detects containerd

### Usage in Code

The `CONTAINER_RUNTIME` variable is available to all plugins and server code:

```javascript
// Access the runtime type
const runtime = process.env.CONTAINER_RUNTIME;
// Values: 'docker', 'podman', 'kubernetes', 'containerd', 'crio', 'lxc', or undefined

// Check if running in any container
const isContainer = process.env.IS_IN_DOCKER === 'true';

// Example: Runtime-specific behavior
if (runtime === 'podman') {
  // Use rootless-friendly paths
  console.log('Running in Podman - using user-space configuration');
} else if (runtime === 'kubernetes') {
  // Use K8s service discovery
  console.log('Running in Kubernetes - using cluster DNS');
}
```

### Manual Override

You can override the automatic detection:

```bash
# Docker example
docker run -e CONTAINER_RUNTIME=custom signalk/signalk-server:latest

# Podman example
podman run -e CONTAINER_RUNTIME=custom signalk/signalk-server:latest

# Kubernetes example (in deployment YAML)
env:
  - name: CONTAINER_RUNTIME
    value: "custom"
```

### Backward Compatibility

The `IS_IN_DOCKER` environment variable remains set to `true` in all containerized environments for backward compatibility with existing code and plugins.

## Release images

Release images `docker/Dockerfile_rel` are size optimized and there are only mandatory files in the images. During the release process updated npm packages in the server repo are built and published to npmjs. Release docker image is then built from the published npm packages like Signal K server is installed normally from npmjs.

## Development images

Development images `docker/Dockerfile`include all files from the Signal K server repository's master branch and these images are targeted mainly for development and testing. Development images are built off the files in the repo, including the submodules from `packages` directory.

Development images are tagged `<branch>` (mainly `master`) and `sha`:

```
docker run --init --name signalk-server -p 3000:3000 -v $(pwd):/home/node/.signalk cr.signalk.io/signalk/signalk-server:master
```

## Building from source

To build a docker image locally from source, first build and pack the server:

```sh
npm install
npm run build:all
npm pack --workspaces
npm pack
```

Then build the docker image:

```sh
$ docker build -t signalk-server:master -f docker/Dockerfile .
```

Now you can run the local image:

```sh
docker run --init --name signalk-server -p 3000:3000 -v $(pwd):/home/node/.signalk signalk-server:master
```
