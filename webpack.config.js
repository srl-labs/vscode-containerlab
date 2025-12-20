const path = require('path');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');

// React TopoViewer webview configuration
const reactTopoViewerConfig = {
  mode: 'production',
  target: 'web',
  cache: {
    type: 'filesystem',
    name: 'react-topoviewer-cache'
  },
  entry: './src/reactTopoViewer/webview/index.tsx',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'reactTopoViewerWebview.js'
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'esbuild-loader',
        options: {
          loader: 'tsx',
          target: 'es2017',
          jsx: 'automatic'
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
      filename: 'reactTopoViewerStyles.css'
    })
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js', '.jsx']
  },
  externals: {
    vscode: 'commonjs vscode'
  },
  performance: {
    hints: false
  }
};

module.exports = reactTopoViewerConfig;
