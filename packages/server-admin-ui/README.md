# @signalk/server-admin-ui

Admin interface for the [Signal K](http://signalk.org) [Node Server](https://github.com/SignalK/signalk-server-node).

## Development

The admin UI is a Vite application. During development the Vite dev server serves it with hot reload and proxies API requests to a Signal K server on port 3000, so a server has to be running alongside it. In production the server serves the built files from this package's `public/` directory; in this repository the server resolves `@signalk/server-admin-ui` to this workspace package, so a build is picked up on the next server start.

The development server, the production build, linting, formatting and icon generation are scripts in [package.json](package.json). Icon generation installs its image rasterisers on demand because they are not project dependencies.

## Module Federation

Embedded webapps and plugin configuration panels use Module Federation to share React as a singleton. See the [WebApps documentation](../../docs/develop/webapps.md) for details.
