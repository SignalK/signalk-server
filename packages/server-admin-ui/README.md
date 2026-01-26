# @signalk/server-admin-ui

Used within the [Signal K](http://signalk.org) [Node Server](https://github.com/SignalK/signalk-server-node) to render the admin interface.

This is its own package so when its installed the javascript asset files come compiled. It makes the build process from the git repo easier and more efficient.

## Technology Stack

- **React 19** with functional components, hooks, and the React Compiler
- **TypeScript** with strict mode for type safety
- **Vite** for fast builds with Module Federation support
- **Zustand** for state management (lightweight, ~3KB)
- **React Router v6** for routing
- **Reactstrap 9** with Bootstrap 5 for UI components

## Development

### Quick Start with Hot Reload

The fastest way to develop the Admin UI is using Vite's dev server with hot module replacement:

1. Start the Signal K server on port 3000:

   ```bash
   # From the repository root
   bin/nmea-from-file
   ```

2. In a separate terminal, start the Vite dev server:

   ```bash
   cd packages/server-admin-ui
   npm run dev
   ```

3. Open http://localhost:5173 in your browser

The dev server proxies all API requests (`/signalk/*`, `/skServer/*`, `/plugins/*`) to the Signal K server running on port 3000, giving you hot reload while working against a real server backend.

### Build Workflow

For testing production builds:

```bash
# Install dependencies
npm install

# Build the Admin UI
npm run build

# Link for local testing
npm link
cd ../../
npm link @signalk/server-admin-ui

# Restart Signal K server
npm start
```

Then access the Admin UI at http://localhost:3000.

### Available Scripts

- `npm run dev` - Start Vite dev server with hot reload (port 5173)
- `npm run build` - Build for development
- `npm run prepublishOnly` - Build for production
- `npm run lint` - Run ESLint with auto-fix
- `npm run format` - Format code with Prettier

## Module Federation

The Admin UI supports embedded webapps and plugin configuration panels via Module Federation. External webapps can share React and ReactDOM as singletons to ensure compatibility. See the main [WebApps documentation](../../docs/develop/webapps.md) for details on building embedded components.
