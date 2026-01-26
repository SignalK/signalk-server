import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

// Validate peer dependencies for Module Federation compatibility
import '@signalk/server-admin-ui-dependencies'

/**
 * Custom Vite plugin to replace %ADDONSCRIPTS% placeholder in dev mode.
 * In production, this is replaced server-side with actual addon script tags.
 * In dev mode, we replace it with an empty comment since addons aren't available.
 */
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

/**
 * Custom Vite plugin to strip SVG font format from @font-face declarations in CSS.
 * SVG fonts are obsolete (only needed for IE9 and below) and add ~2.5MB to the bundle.
 * Modern browsers use WOFF2/WOFF which are smaller and universally supported.
 */
function stripSvgFonts() {
  return {
    name: 'strip-svg-fonts',
    enforce: 'post',
    // Transform handles inline CSS in JS modules
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
    // generateBundle handles the final CSS output
    generateBundle(options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        const chunk = bundle[fileName]
        // Process CSS files
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
        // Remove SVG font files from bundle
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
  // Use ES2023 for both dev and build to support top-level await in Module Federation
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
      // Disable TypeScript declaration generation to avoid WebSocket connection errors
      // during dev mode (the dts plugin tries to connect on port 16322)
      dts: false,
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
        // Silence Sass deprecation warnings from dependencies in node_modules
        quietDeps: true,
        // Silence @import deprecation warnings - migration to @use/@forward
        // would require restructuring all SCSS files and Bootstrap 5 itself
        // still uses @import internally. Will address when Dart Sass 3.0 is released.
        silenceDeprecations: ['import']
      }
    }
  },
  server: {
    port: 5173,
    // Bind to localhost only by default for security
    // Use `npm run dev -- --host 0.0.0.0` to expose to network
    host: 'localhost',
    proxy: {
      // Proxy SignalK API and WebSocket to the running server
      '/signalk': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      },
      // Proxy admin server routes
      '/skServer': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        ws: true
      },
      // Proxy plugin public files
      '/plugins': {
        target: 'http://localhost:3000',
        changeOrigin: true
      },
      // Proxy webapp files (scoped packages like @signalk/*, @mxtommy/kip, etc.)
      // Exclude Vite internals (/@vite, /@react-refresh, /@fs, /@id)
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
      path: false,
      // Polyfill Node.js modules for browser compatibility
      events: 'events',
      buffer: 'buffer'
    }
  }
})
