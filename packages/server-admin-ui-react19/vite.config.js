/// <reference types="vitest" />
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

import '@signalk/server-admin-ui-dependencies'

// %ADDONSCRIPTS% is replaced server-side in production with actual addon script tags
function replaceAddonScripts() {
  return {
    name: 'replace-addon-scripts',
    transformIndexHtml(html) {
      return html.replace(
        '%ADDONSCRIPTS%',
        '<!-- addon scripts not available in dev mode -->'
      )
    }
  }
}

// Strip obsolete SVG font references from @font-face declarations (~2.5MB savings)
function stripSvgFonts() {
  return {
    name: 'strip-svg-fonts',
    enforce: 'post',
    transform(code, id) {
      if (!id.includes('.css') && !id.includes('.scss')) {
        return null
      }
      const svgFontRegex =
        /,?\s*url\(['"]?[^'"()]+\.svg[^'"()]*['"]?\)\s*format\(['"]svg['"]\)/gi
      if (svgFontRegex.test(code)) {
        return {
          code: code.replace(svgFontRegex, ''),
          map: null
        }
      }
      return null
    },
    generateBundle(options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName]
        if (chunk.type === 'asset' && fileName.endsWith('.css')) {
          const svgFontRegex =
            /,?\s*url\(['"]?[^'"()]+\.svg[^'"()]*['"]?\)\s*format\(['"]svg['"]\)/gi
          if (
            typeof chunk.source === 'string' &&
            svgFontRegex.test(chunk.source)
          ) {
            chunk.source = chunk.source.replace(svgFontRegex, '')
          }
        }
        if (
          chunk.type === 'asset' &&
          fileName.endsWith('.svg') &&
          (fileName.includes('fontawesome') ||
            fileName.includes('fa-') ||
            fileName.includes('Simple-Line-Icons'))
        ) {
          delete bundle[fileName]
        }
      }
    }
  }
}

export default defineConfig({
  base: './',
  publicDir: 'public_src',
  // Module Federation requires top-level await (ES2023)
  esbuild: {
    target: 'es2023'
  },
  optimizeDeps: {
    esbuildOptions: {
      target: 'es2023'
    }
  },
  plugins: [
    replaceAddonScripts(),
    stripSvgFonts(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler', {}]],
        presets: [['@babel/preset-react', { runtime: 'automatic' }]]
      }
    }),
    federation({
      name: 'adminUI',
      filename: 'remoteEntry.js',
      remotes: {},
      dts: false, // dts plugin tries to connect on port 16322 in dev mode
      shared: {
        react: {
          singleton: true,
          // Must specify React 19 explicitly — the monorepo root has React 16
          // (from the old admin UI) which Module Federation picks up otherwise,
          // causing "Cannot read properties of undefined (reading 'ReactCurrentOwner')"
          requiredVersion: '^19.0.0',
          version: '19.2.0'
        },
        'react-dom': {
          singleton: true,
          requiredVersion: '^19.0.0',
          version: '19.2.0'
        }
      }
    })
  ],
  css: {
    preprocessorOptions: {
      scss: {
        quietDeps: true,
        // Bootstrap 5 still uses @import internally
        silenceDeprecations: ['import']
      }
    }
  },
  server: {
    port: 5173,
    host: 'localhost',
    proxy: {
      '/signalk': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      },
      '/skServer': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      },
      '/plugins': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // Proxy scoped webapp packages (@signalk/*, etc.) but not Vite internals
      '/@': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        bypass: (req) => {
          if (
            req.url.startsWith('/@vite') ||
            req.url.startsWith('/@react-refresh') ||
            req.url.startsWith('/@fs') ||
            req.url.startsWith('/@id')
          ) {
            return req.url
          }
        }
      }
    }
  },
  build: {
    outDir: 'public',
    sourcemap: true,
    target: 'es2023',
    assetsInlineLimit: 0, // Prevent inlining assets to allow server-side logo override
    cssCodeSplit: false // Generate single CSS file to ensure it's always loaded
  },
  resolve: {
    alias: {
      // Force all React imports to resolve to our local React 19 packages.
      // Without this, dependencies (react-select/Emotion, etc.) resolve to the
      // root workspace's React 16, causing "Cannot read properties of undefined
      // (reading 'ReactCurrentOwner')" at runtime.
      react: path.resolve(__dirname, 'node_modules/react'),
      'react-dom': path.resolve(__dirname, 'node_modules/react-dom'),
      path: false,
      events: 'events',
      buffer: 'buffer'
    }
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/test/**', 'src/**/*.d.ts']
    }
  }
})
