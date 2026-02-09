# @signalk/server-admin-ui

Admin interface for the [Signal K](http://signalk.org) [Node Server](https://github.com/SignalK/signalk-server-node).

## Development

### Hot Reload

1. Start the Signal K server on port 3000:

   ```bash
   bin/nmea-from-file
   ```

2. In a separate terminal, start the Vite dev server:

   ```bash
   cd packages/server-admin-ui-react19
   npm run dev
   ```

3. Open http://localhost:5173 in your browser

The dev server proxies API requests to the Signal K server on port 3000.

### Production Build

```bash
npm run build
npm link
cd ../../
npm link @signalk/server-admin-ui
npm start
```

Then access the Admin UI at http://localhost:3000.

### Scripts

- `npm run dev` - Vite dev server with hot reload (port 5173)
- `npm run build` - Production build
- `npm run lint` - ESLint with auto-fix
- `npm run format` - Prettier

## Module Federation

Embedded webapps and plugin configuration panels use Module Federation to share React as a singleton. See the [WebApps documentation](../../docs/develop/webapps.md) for details.
