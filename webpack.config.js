const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const editorConfig = {
  mode: 'production', // or 'development' for debugging
  target: 'web',
  entry: './src/topoViewer/webview-ui/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'topologyEditorWebviewController.js',
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
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader'
        ]
      },
      {
        test: /\.(woff2?|eot|ttf|otf|svg)$/i,
        type: 'asset/resource',
        generator: {
          filename: 'webfonts/[name][ext][query]'
        }
      }
    ]
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: 'topoViewerEditorStyles.css'
    })
  ],
  resolve: {
    extensions: ['.ts', '.js']
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  // Disable asset size warnings to keep the build output clean. The
  // bundled webview code is quite large but the size is acceptable for the
  // extension, so we suppress webpack's performance hints.
  performance: {
    hints: false
  }
};

module.exports = [editorConfig];
