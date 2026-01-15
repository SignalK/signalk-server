const path = require('path')
const { ModuleFederationPlugin } = require('webpack').container

module.exports = {
  entry: {},
  output: {
    path: path.resolve(__dirname, 'public'),
    filename: '[name].js',
    publicPath: 'auto'
  },
  module: {
    rules: [
      {
        test: /\.jsx?$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            presets: ['@babel/preset-react']
          }
        }
      }
    ]
  },
  plugins: [
    new ModuleFederationPlugin({
      name: 'signalk_test_custom_renderer',
      filename: 'remoteEntry.js',
      exposes: {
        './TestRenderer': './src/TestRenderer.jsx',
        './AppPanel': './src/AppPanel.jsx'
      },
      shared: {
        react: {
          singleton: true,
          requiredVersion: false
        },
        'react-dom': {
          singleton: true,
          requiredVersion: false
        }
      }
    })
  ]
}
