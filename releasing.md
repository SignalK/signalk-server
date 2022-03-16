```
npm version [<newversion> | major | minor | patch | premajor | preminor | prepatch | prerelease | from-git]
npm run release
```
# Releasing
![releasing.png](img/releasing.png)

## NPM releases
When release is done, npm packages are build and published from `./packages` -folder to [www.npmjs.com](https://www.npmjs.com).
- steps are described in above picture

NPM Packages are:
- @signalk/server-admin-ui-dependencies
- @signalk/server-admin-ui
- @signalk/server-api
- @signalk/streams
- signalk-server

## Docker release
Docker images are build after npm packages are published npmjs.com. Docker images are then build using just published npm packages.
Images are pushed to [hub.docker.com](https://hub.docker.com).

Docker Images are:
- signalk/signalk-server:latest
- signalk/signalk-server:`<release tag>`, e.g. `v1.40.0`

Supported os/architectures are:
- linux/amd64
- linux/arm/v7
- linux/arm64

More docker information can found from [docker](docker/) -folder
