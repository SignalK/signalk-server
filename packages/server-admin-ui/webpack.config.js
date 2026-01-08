const webpack = require('webpack')
const HtmlWebpackPlugin = require('html-webpack-plugin')
const CopyWebpackPlugin = require('copy-webpack-plugin')
const BundleAnalyzerPlugin =
  require('webpack-bundle-analyzer').BundleAnalyzerPlugin
const { ModuleFederationPlugin } = require('webpack').container
require('@signalk/server-admin-ui-dependencies')
const devDeps = require('./package.json').devDependencies

const path = require('path')

module.exports = {
  entry: './src/index',
  mode: 'development',
  output: {
    path: path.resolve(__dirname, 'public')
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
          presets: ['@babel/preset-react']
        }
      },
      {
        // Load font files (woff, woff2, ttf, eot)
        test: /\.(woff(2)?|ttf|eot)(\?v=\d+\.\d+\.\d+)?$/,
        type: 'asset/resource',
        generator: {
          filename: './fonts/[name].[hash][ext]'
        }
      },
      {
        // Skip SVG font files from node_modules (only needed for IE9)
        // This reduces bundle size by ~2MB
        test: /\.svg(\?.*)?$/,
        include: /node_modules/,
        use: {
          loader: 'file-loader',
          options: {
            emitFile: false,
            name: '[name].[ext]'
          }
        }
      },
      {
        // Handle project SVG images (not from node_modules)
        test: /\.svg$/,
        exclude: /node_modules/,
        type: 'asset/resource'
      },
      {
        test: /\.(scss)$/,
        use: [
          // Creates `style` nodes from JS strings
          'style-loader',
          // Translates CSS into CommonJS
          'css-loader',
          // Compiles Sass to CSS
          {
            loader: 'sass-loader',
            options: {
              sassOptions: {
                // Silence deprecation warnings from Bootstrap 4 (deprecated library)
                silenceDeprecations: [
                  'import',
                  'global-builtin',
                  'color-functions',
                  'legacy-js-api'
                ],
                quietDeps: true
              }
            }
          }
        ]
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader']
      }
    ]
  },
  resolve: {
    fallback: {
      //needed by react-markdown ... vfile | replace-ext
      path: false
    }
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public_src/index.html'
    }),
    new CopyWebpackPlugin(
      {
        patterns: [{ from: './public_src/img', to: 'img' }]
      },
      {
        copyUnmodified: false
      }
    ),
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/
    }),
    new BundleAnalyzerPlugin({
      analyzerMode: 'disabled',
      generateStatsFile: true,
      statsOptions: { source: false }
    }),
    new ModuleFederationPlugin({
      name: 'adminUI)',
      filename: 'remoteEntry.js',
      remotes: {},
      shared: {
        react: { requiredVersion: devDeps.react, singleton: true },
        'react-dom': { requiredVersion: devDeps['react-dom'] }
      }
    })
  ],
  devtool: 'source-map',
  performance: {
    // Disable size warnings for this admin UI application
    // Large assets (fonts, bundled JS) are expected and acceptable
    hints: false
  }
}
