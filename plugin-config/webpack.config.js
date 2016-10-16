var path = require('path');
var webpack = require('webpack');

module.exports = {
  entry: {
    main: [
      './src/main.js'
    ]
  },
  output: {
    path: path.join(__dirname, 'public'),
    filename: '[name].js',
    publicPath: '/plugins/config/'
  },
  module: {
    loaders: [{
        test: /\.jsx?$/,
        exclude: /node_modules/,
        loader: 'babel',
        query: {
          presets: ['es2015', 'react', 'stage-2']
        }
      },
      {
        test: /\.json$/,
        loader: 'json'
      }
    ]
  },
  externals: {
    React: "React",
    ReactDOM: "ReactDOM"
  },
  resolveLoader: {
    fallback: path.join(__dirname, "node_modules")
  },
}
