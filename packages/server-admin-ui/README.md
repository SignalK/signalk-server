# @signalk/server-admin-ui

Used within the [Signal K](http://signalk.org) [Node Server](https://github.com/SignalK/signalk-server-node) to render the admin interface.

This is its own package so when its installed the javascript asset files come compiled. It makes the build process from the git repo easier and more efficient.

## Development

- Install dev packages with `npm i`.
- Edit files with `/src`.
- Run `npm run prepublishOnly`
- `npm link`
- `cd ../../`
- `npm link @signalk/server-admin-ui`
- Restart signalk `npm start`
