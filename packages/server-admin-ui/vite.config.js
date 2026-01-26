import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

// Note: Peer dependency validation skipped for legacy admin UI
// The @signalk/server-admin-ui-dependencies package expects React 19
// This legacy UI uses React 16 and is kept as a fallback

export default defineConfig({
  base: './',
  publicDir: 'public_src',
  plugins: [
    react({
      babel: {
        presets: ['@babel/preset-react']
      }
    }),
    federation({
      name: 'adminUI',
      filename: 'remoteEntry.js',
      remotes: {},
      shared: {
        react: {
          singleton: true,
          requiredVersion: '^16.14.0'
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^16.14.0'
        }
      }
    })
  ],
  css: {
    preprocessorOptions: {
      scss: {
        // Silence deprecation warnings from Bootstrap 4 (legacy dependency)
        // These warnings are from Bootstrap's old Sass code and will be resolved when upgrading to Bootstrap 5
        quietDeps: true,
        silenceDeprecations: [
          'import',
          'global-builtin',
          'color-functions',
          'slash-div',
          'if-function',
          'abs-percent'
        ]
      }
    }
  },
  build: {
    outDir: 'public',
    sourcemap: true,
    target: 'es2022',
    assetsInlineLimit: 0, // Prevent inlining assets to allow server-side logo override
    cssCodeSplit: false // Generate single CSS file to ensure it's always loaded
  },
  resolve: {
    alias: {
      path: false,
      // Polyfill Node.js modules for browser compatibility
      events: 'events',
      buffer: 'buffer'
    }
  }
})
