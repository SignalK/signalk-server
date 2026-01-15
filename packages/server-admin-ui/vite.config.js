import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

// Validate peer dependencies for Module Federation compatibility
import '@signalk/server-admin-ui-dependencies'

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
          // Allow any React version for backward compatibility with older webapps
          requiredVersion: false
        },
        'react-dom': {
          singleton: true,
          // Allow any React version for backward compatibility with older webapps
          requiredVersion: false
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
