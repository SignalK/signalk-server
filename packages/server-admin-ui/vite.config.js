import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'
import path from 'path'

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
          requiredVersion: '^16.14.0'
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^16.14.0'
        }
      }
    })
  ],
  build: {
    outDir: 'public',
    sourcemap: true,
    target: 'es2022',
    assetsInlineLimit: 0 // Prevent inlining assets to allow server-side logo override
  },
  resolve: {
    alias: {
      path: false
    }
  }
})
