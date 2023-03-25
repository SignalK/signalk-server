# General

Docker images are built after npm packages are published to npmjs.com. Docker images are then build using the just published npm packages. Images are available at [GitHub Container registry](https://github.com/orgs/SignalK/packages/container/package/signalk-server).

Release images:
- signalk/signalk-server:latest
- signalk/signalk-server:`<release tag>`, e.g. `v1.40.0`

Supported os/architectures:
- linux/amd64
- linux/arm/v7
- linux/arm64

# Quickstart

You can start a local server on port 3000  with demo data with

```
docker pull cr.signalk.io/signalk/signalk-server
```

```
docker run --init -it --rm --name signalk-server --publish 3000:3000 --entrypoint /home/node/signalk/bin/signalk-server signalk/signalk-server --sample-nmea0183-data
```

For real use you need to persist /home/node/.signalk where the server's configuration is stored, with for example

```
docker run -d --init  --name signalk-server -p 3000:3000 -v $(pwd):/home/node/.signalk signalk/signalk-server
```
This will run the server as background process and current directory as the settings directory. You will be prompted to create admin credentials the first time you you access the configuration admin web UI.

## Docker Compose

See `docker/docker-compose.yml` for reference / example if you want to use docker-compose.

# Image details and used tags

Signal K Server docker images are based on Ubuntu 20.04 LTS. During build process, Node 16.x is installed including tools required to install or compile plugins. Signalk support mDNS from docker, uses avahi for e.g. mDNS discovery. All required avahi tools and settings are available for user `node`, also from command line.

## Release images

Release images `docker/Dockerfile_rel` are size optimized and there are only mandatory files in the images. During the release process updated npm packages in the server repo are built and published to npmjs. Release docker image is then built from the published npm packages like Signal K server is installed normally from npmjs.

Release images can be found from Container registry [cr.signalk.io/signalk/signalk-server](https://cr.signalk.io/signalk/signalk-server), tagged `latest` or e.g. `v1.40.0`. `latest` refers to last released version.

## Development images

Development images `docker/Dockerfile`include all files from the Signal K server repository (1-to-1 copy) and these images are targeted mainly for development and testing. Development images are built off the files in the repo, including the submodules from `packages` directory.

Development docker images can be found from Container registry [cr.signalk.io/signalk/signalk-server](https://cr.signalk.io/signalk/signalk-server), tagged with `<branch>` (mainly `master`) and `sha`

## Directory structure

* server files: `/home/node/signalk`
* user files (including settings and plugins): `/home/node/.signalk` 

You most probably want to mount `/home/node/.signalk` from the host or as a volume to persist your settings.
