const HtmlWebpackPlugin = require('html-webpack-plugin');
const path = require('path');

const { ModuleFederationPlugin } = require('webpack').container;
const { WatchIgnorePlugin } = require('webpack')

console.log(path.resolve(__dirname, 'public'))
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
          presets: ['@babel/preset-react'],
        },
      },
    ],
  },
  plugins: [
    // Use Plugin
    new ModuleFederationPlugin({
      name: 'Addon Demo',
      library: { type: 'var', name: 'addon_demo' },
      filename: 'remoteEntry.js',
      exposes: {
        // expose each component you want 
        './AddonPanel': './src/components/AddonPanel',
      },
      shared: ['react', 'react-dom'],
    }),
    new WatchIgnorePlugin({
      paths: [path.resolve(__dirname, 'public/')]}),
    new HtmlWebpackPlugin({
      template: './public/index.html',
    }),
  ],
};