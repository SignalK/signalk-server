# Publishing Prerelease versions

- [Check the status in npm](http://registry.npmjs.org/-/package/signalk-server/dist-tags)
- Set version & tag using `npm version` as usual but specify the version, for example `npm version 1.19.0-beta.2`
- `npm run release` as usual
- `npm publish --tag beta` REMEMBER this, otherwise the published version will be a regular one
