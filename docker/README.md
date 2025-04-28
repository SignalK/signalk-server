# General

Release process first publishes the server's modules to npm. Docker images are then built using the just published npm packages. Images (including older versions) are available at [Docker Hub](https://hub.docker.com/r/signalk/signalk-server) and starting from v2 at [GitHub Container registry](https://github.com/orgs/SignalK/packages/container/package/signalk-server). Going forward **use the full image name, including the registry cr.signalk.io**. That address will be updated to redirect to the recommended registry where the latest released version can be found.

Release images:

- cr.signalk.io/signalk/signalk-server:latest
- cr.signalk.io/signalk/signalk-server:`<release tag>`, e.g. `v1.40.0`

Supported os/architectures:

- linux/amd64
- linux/arm/v7
- linux/arm64

# Quickstart

You can start a local server on port 3000 with demo data with

```
docker run --init -it --rm --name signalk-server --publish 3000:3000 --entrypoint /home/node/signalk/bin/signalk-server cr.signalk.io/signalk/signalk-server --sample-nmea0183-data
```

For real use you need to persist /home/node/.signalk where the server's configuration is stored, with for example

```
docker run -d --init  --name signalk-server -p 3000:3000 -v $(pwd):/home/node/.signalk cr.signalk.io/signalk/signalk-server
```

This will run the server as background process and current directory as the settings directory. You will be prompted to create admin credentials the first time you you access the configuration admin web UI.

## Docker Compose

See `docker/docker-compose.yml` for reference / example if you want to use docker-compose.

# Image details and used tags

Signal K Server docker images are based on Ubuntu 20.04 LTS. During build process, Node 16.x is installed including tools required to install or compile plugins. Signalk support mDNS from docker, uses avahi for e.g. mDNS discovery. All required avahi tools and settings are available for user `node`, also from command line.

## Release images

Release images `docker/Dockerfile_rel` are size optimized and there are only mandatory files in the images. During the release process updated npm packages in the server repo are built and published to npmjs. Release docker image is then built from the published npm packages like Signal K server is installed normally from npmjs.

## Development images

Development images `docker/Dockerfile`include all files from the Signal K server repository's master branch and these images are targeted mainly for development and testing. Development images are built off the files in the repo, including the submodules from `packages` directory.

Development images are tagged `<branch>` (mainly `master`) and `sha`:

```
docker run --init --name signalk-server -p 3000:3000 -v $(pwd):/home/node/.signalk cr.signalk.io/signalk/signalk-server:master
```

## Directory structure

- server files: `/home/node/signalk`
- settings files and plugins: `/home/node/.signalk`

You most probably want to mount `/home/node/.signalk` from the host or as a volume to persist your settings.

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
