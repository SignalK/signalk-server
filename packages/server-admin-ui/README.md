# @signalk/server-admin-ui

Used within the [Signal K](http://signalk.org) [Node Server](https://github.com/SignalK/signalk-server-node) to render the admin interface.

This is its own package so when its installed the javascript asset files come compiled. It makes the build process from the git repo easier and more efficient.

## Technology Stack

- **React 19** with functional components and hooks
- **TypeScript** for type safety
- **Vite** for fast builds with Module Federation support
- **Redux** for state management (with `useSelector`/`useDispatch` hooks)
- **React Router v6** for routing
- **Reactstrap 9** with Bootstrap 5 for UI components

## Development

- Install dev packages with `npm i`.
- Edit files within `/src`.
- Run `npm run build` to build
- Run `npm run prepublishOnly` for production build
- `npm link`
- `cd ../../`
- `npm link @signalk/server-admin-ui`
- Restart signalk `npm start`

## Module Federation

The Admin UI supports embedded webapps and plugin configuration panels via Module Federation. External webapps can share React and ReactDOM as singletons to ensure compatibility. See the main [WebApps documentation](../../docs/develop/webapps.md) for details on building embedded components.
