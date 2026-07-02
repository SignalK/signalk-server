# General

Release process first publishes the server's modules to npm. Docker images are then built using the just published npm packages. Images (including older versions) are available at [Docker Hub](https://hub.docker.com/r/signalk/signalk-server) and starting from v2 at [GitHub Container registry](https://github.com/orgs/SignalK/packages/container/package/signalk-server). Going forward **use the full image name, including the registry cr.signalk.io**. That address will be updated to redirect to the recommended registry where the latest released version can be found.

Release images:

- cr.signalk.io/signalk/signalk-server:latest
- cr.signalk.io/signalk/signalk-server:`<release tag>`, e.g. `v2.16.0`

A slimmer **"core"** variant is published in parallel for deployments that don't need the bundled webapps and plugins (data forwarders, embedded integrations, custom-UI deployments, security-sensitive setups). See [Core image variant](#core-image-variant) below.

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

The server automatically detects which container runtime is being used (Docker, Podman, Kubernetes, etc.) and sets the `CONTAINER_RUNTIME` environment variable. Plugins can use this to adapt their behavior.

Supported runtimes: `docker`, `podman`, `kubernetes`, `containerd`, `crio`, `lxc`

## Release images

Release images `docker/Dockerfile_rel` are size optimized and there are only mandatory files in the images. During the release process updated npm packages in the server repo are built and published to npmjs. Release docker image is then built from the published npm packages like Signal K server is installed normally from npmjs.

## Core image variant

The **core** variant strips the bundled webapps and plugins from the image, keeping the Signal K server, the admin UI, serial-port support, and required libraries. Use it for a leaner image without the preinstalled webapps and plugins — for example, a deployment behind a curated set of apps, an embedded integration, or a security-sensitive setup that wants a smaller attack surface. The admin UI and its app store remain available, so webapps and plugins can be added on demand.

### Tags

| Variant | Ubuntu rolling | Alpine rolling        | Ubuntu pinned | Alpine pinned        |
| ------- | -------------- | --------------------- | ------------- | -------------------- |
| Full    | `:latest`      | `:latest-alpine`      | `:X.Y.Z`      | `:X.Y.Z-alpine`      |
| Core    | `:latest-core` | `:latest-alpine-core` | `:X.Y.Z-core` | `:X.Y.Z-alpine-core` |

The core `-core` suffix is appended after the full variant's tag, so core mirrors every full tag. Versioned core tags follow the existing major / major.minor pattern (`:v2-core`, `:v2.27-core`, plus `-alpine-core` siblings).

### What's stripped

The core image omits these packages — all declared in `package.json` `optionalDependencies` and discovered at runtime from `/home/node/.signalk`, so they can be reinstalled on demand (see below):

- Webapps: `@signalk/freeboard-sk`, `@signalk/instrumentpanel`, `@mxtommy/kip`, `@signalk/app-dock`
- Plugins and bridges: `@signalk/set-system-time`, `@signalk/signalk-to-nmea0183`, `@signalk/udp-nmea-plugin`, `signalk-n2kais-to-nmea0183`, `signalk-to-nmea2000`

What the core image ships: the Signal K server, the admin UI (`@signalk/server-admin-ui`) and its app store, serial-port support (`serialport`), `@signalk/server-api`, `@signalk/streams`, `@signalk/signalk-schema`, `@signalk/course-provider`, `@signalk/resources-provider`, and the NMEA0183 / NMEA2000 parser libraries (`@signalk/nmea0183-signalk`, `@signalk/n2k-signalk`).

The admin UI and `serialport` are themselves declared `optionalDependencies`, so `--omit=optional` strips them too — but the core image **reinstates** them, because neither can be added back at the config-directory layer: the server serves the admin UI from a fixed path inside its own install, and it `require`s `serialport` directly. (`serialport` stays optional rather than a hard dependency so direct npm installs degrade gracefully on platforms without prebuilt bindings.)

### App store and plugin installation

Because the admin UI ships in core, its **app store is available** — the omitted webapps and plugins can be reinstalled from the app store UI at runtime. For reproducible deployments you can also bake them into a derived image or install them ad-hoc:

**Declarative — recommended for reproducible deployments**

```Dockerfile
FROM cr.signalk.io/signalk/signalk-server:core
RUN npm install --prefix /home/node/.signalk @signalk/some-plugin
```

Build with `docker build -t my-signalk-core .` and run as you would the base core image.

**Ad-hoc — for incremental experimentation**

Mount `/home/node/.signalk` as a persistent volume, then `exec` into the running container to install:

```sh
docker exec my-container npm install --prefix /home/node/.signalk @signalk/some-plugin
docker restart my-container
```

Both patterns install into the persisted config directory (`/home/node/.signalk`), which the server scans for modules carrying the `signalk-node-server-plugin` or `signalk-webapp` keyword.

### Behavioral change for non-Docker consumers

The bundled webapps, plugins, the admin UI, and `serialport` are all declared in `optionalDependencies`, not `dependencies`. **Default `npm install` is unaffected** because npm installs optional deps by default — the full Docker image and direct-from-npm installs ship them all. A consumer passing `npm install signalk-server --omit=optional` (CI pipelines, security-conscious deployments, distros) gets a minimal headless server: no admin UI, no serial-port support, and none of the bundled webapps or plugins. The core Docker image starts from that minimal set and adds back the admin UI and `serialport` — the two that can't be installed later at the config-directory layer. To get everything, drop the `--omit=optional` flag.

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
