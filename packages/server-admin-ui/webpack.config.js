import webpack from 'webpack'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import CopyWebpackPlugin from 'copy-webpack-plugin'
import { BundleAnalyzerPlugin } from 'webpack-bundle-analyzer'
import '@signalk/server-admin-ui-dependencies'
import path from 'path'
import pkg from './package.json' with { type: 'json' }

const devDeps = pkg.devDependencies

export default {
  entry: './src/index',
  mode: 'development',
  output: {
    path: path.resolve(import.meta.dirname, 'public'),
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        loader: 'babel-loader',
        exclude: /node_modules/,
        options: {
          presets: ['@babel/preset-react'],
        },
      },
      {
        test: /\.(woff(2)?|ttf|eot|svg)(\?v=\d+\.\d+\.\d+)?$/,
        loader: 'file-loader',
        options: {
          name: './fonts/[name].[hash].[ext]',
        },
      },
      {
        test: /\.(scss)$/,
        use: [
          // Creates `style` nodes from JS strings
          'style-loader',
          // Translates CSS into CommonJS
          'css-loader',
          // Compiles Sass to CSS
          'sass-loader',
        ],
      },
      {
        test: /\.css$/i,
        use: ['style-loader', 'css-loader'],
      },
    ],
  },
  resolve: {
    fallback: {
      //needed by react-markdown ... vfile | replace-ext
      path: false,
    },
  },
  plugins: [
    new HtmlWebpackPlugin({
      template: './public_src/index.html',
    }),
    new CopyWebpackPlugin(
      {
        patterns: [{ from: './public_src/img', to: 'img' }],
      },
      {
        copyUnmodified: false,
      }
    ),
    new webpack.IgnorePlugin({
      resourceRegExp: /^\.\/locale$/,
      contextRegExp: /moment$/,
    }),
    new BundleAnalyzerPlugin({
      analyzerMode: 'disabled',
      generateStatsFile: true,
      statsOptions: { source: false },
    }),
    new webpack.container.ModuleFederationPlugin({
      name: 'adminUI)',
      filename: 'remoteEntry.js',
      remotes: {},
      shared: {
        react: { requiredVersion: devDeps.react, singleton: true },
        'react-dom': { requiredVersion: devDeps['react-dom'] },
      },
    }),
  ],
  devtool: 'source-map',
}
