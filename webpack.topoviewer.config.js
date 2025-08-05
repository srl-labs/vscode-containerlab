const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

module.exports = {
  mode: 'production', // or 'development' for debugging
  target: 'web',
  entry: './src/topoViewerTs/webview-ui/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'topoViewerEngine.js',
    library: {
      type: 'var',
      name: 'TopoViewerEngine'
    }
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            configFile: 'tsconfig.topoviewer.json',
            transpileOnly: true,
            ignoreDiagnostics: [
              2323, // Cannot redeclare exported variable
              2484, // Export declaration conflicts
              2683, // 'this' implicitly has type 'any'
              6059, // File is not under 'rootDir'
            ]
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: [MiniCssExtractPlugin.loader, 'css-loader']
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'topoViewerStyles.css'
    })
  ],
  resolve: {
    extensions: ['.ts', '.js'],
    fallback: {
      "path": false,
      "fs": false,
      "os": false,
      "crypto": false,
      "stream": false,
      "assert": false,
      "http": false,
      "https": false,
      "url": false,
      "zlib": false
    }
  },
  // Disable asset size warnings to keep the build output clean. The
  // bundled webview code is quite large but the size is acceptable for the
  // extension, so we suppress webpack's performance hints.
  performance: {
    hints: false
  }
};