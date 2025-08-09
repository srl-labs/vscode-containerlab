const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

const editorConfig = {
  mode: 'production', // or 'development' for debugging
  target: 'web',
  entry: './src/topoViewer/edit/webview-ui/topoViewerEditorEngine.ts',
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
  // Disable asset size warnings to keep the build output clean. The
  // bundled webview code is quite large but the size is acceptable for the
  // extension, so we suppress webpack's performance hints.
  performance: {
    hints: false
  }
};

const topoViewerConfig = {
  mode: 'production', // or 'development' for debugging
  target: 'web',
  entry: './src/topoViewer/view/webview-ui/index.ts',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'topoViewerEngine.js'
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: {
          loader: 'ts-loader',
          options: {
            transpileOnly: true,
            ignoreDiagnostics: [
              2323, // Cannot redeclare exported variable
              2484, // Export declaration conflicts
              2683, // 'this' implicitly has type 'any'
              6059  // File is not under 'rootDir'
            ]
          }
        },
        exclude: /node_modules/
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          'css-loader',
          'postcss-loader'
        ]
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
      path: false,
      fs: false,
      os: false,
      crypto: false,
      stream: false,
      assert: false,
      http: false,
      https: false,
      url: false,
      zlib: false
    }
  },
  // Disable asset size warnings to keep the build output clean. The
  // bundled webview code is quite large but the size is acceptable for the
  // extension, so we suppress webpack's performance hints.
  performance: {
    hints: false
  }
};

module.exports = [editorConfig, topoViewerConfig];
