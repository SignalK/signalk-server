import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { federation } from '@module-federation/vite'

// Validate peer dependencies for Module Federation compatibility
import '@signalk/server-admin-ui-dependencies'

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
  plugins: [
    stripSvgFonts(),
    react({
      babel: {
        presets: [['@babel/preset-react', { runtime: 'automatic' }]]
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
        // Silence Sass deprecation warnings from dependencies in node_modules
        quietDeps: true,
        // Silence @import deprecation warnings - migration to @use/@forward
        // would require restructuring all SCSS files and Bootstrap 5 itself
        // still uses @import internally. Will address when Dart Sass 3.0 is released.
        silenceDeprecations: ['import']
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
