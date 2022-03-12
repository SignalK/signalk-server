```
npm version [<newversion> | major | minor | patch | premajor | preminor | prepatch | prerelease | from-git]
npm run release
```

# Release details

Signalk K docker images are based on Ubuntu 20.04 LTS. During build process, Node 16.x is installed including tools required to install or compile plugins. Signalk support mDNS from docker, uses avahi for e.g. mDNS discovery. All required avahi tools and settings are available for user `node`, also from command line.

## Official releases

Official releases `docker/Dockerfile_rel` are size vice optimized versions and there are only mandatory files in the images. Image is generated when release is done for Signal K and it is tagged with v* label. During the build process, npm packages are also build and published to npmjs. Offcial Signal K docker image is then build from just published npm packages with similar manners as Signal K would be installed normally from npmjs.

Official docker images can be found from Docker Hub (dockerhub.com) under `signalk/signalk-server-docker`
Released npm packages can be found from npmjs (npmjs.org) under `signalk` namespace.

## Development releses

Development releses `docker/Dockerfile` are including all files from the Signal K server repository (1-to-1 copy) and these images are targeted mainly for development and testing purposes.
Install is using `npm ci` method to keep dependecies the same as they were in the release time.  

Development docker images can be found from Docker Hub (dockerhub.com) under `signalk/signalk-server`

## General info of images

All released docker images have following folder structures
* server files `/home/node/signalk`
* user files `/home/node/.signalk` 

Working directory is always mapped to `/home/node/.signalk`, where user files are stored.

## Docker Compose

Use `docker/docker-compose.yml` for a reference or example if you want to use docker-compose.