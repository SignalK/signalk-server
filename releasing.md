# Releasing a new server version

### (0) Update submodule versions

Update package.jsons of individual modules under `packages` as well as dependent module package.jsons and root package.json.

Npm Packages are:

- @signalk/server-admin-ui-dependencies
- @signalk/server-admin-ui
- @signalk/server-api
- @signalk/streams
- @signalk/resources-provider
- signalk-server

### (1) create new server version

```
npm version major | minor | patch
```

This will update root package.json, commit the change and create the version git tag. Then push master & the tag to Github with `git push && git push --tags` and GH Actions will take care of the rest.

_Prerelease versions_

- [Check the status in npm](http://registry.npmjs.org/-/package/signalk-server/dist-tags)
- Set package.json version & git tag using `npm version` as usual but specify the version, for example `npm version 1.19.0-beta.2`
- Prerelease version **MUST CONTAIN THE STRING beta** as the release actions branch on that

### (2) Push git tag

![releasing.png](img/releasing.png)

This will trigger GH action that

- builds and publishes all the submodules whose version does not match the latest version in npm
- builds and publishes the server
- builds docker images tagged with version and `latest`
- deploys the version at fly.io as https://demo.signalk.org/
