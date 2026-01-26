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
        test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
        loader: 'file-loader',
        options: {
          name: './fonts/[name].[hash].[ext]'
        }
      },
      {
        test: /\.(scss)$/,
        use: [
          // Creates `style` nodes from JS strings
          'style-loader',
          // Translates CSS into CommonJS
          'css-loader',
          // Compiles Sass to CSS
          'sass-loader'
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
  devtool: 'source-map'
}
