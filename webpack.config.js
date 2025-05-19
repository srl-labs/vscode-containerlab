const path = require('path');

module.exports = {
  mode: 'production', // or 'development' for debugging
  target: 'web',
  entry: './src/topoViewerEditor/webview-ui/topoViewerEditorEngine.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'topoViewerEditorEngine.js',
    libraryTarget: 'module'
  },
  experiments: {
    outputModule: true
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/
      }
    ]
  },
  resolve: {
    extensions: ['.ts', '.js']
  }
};
