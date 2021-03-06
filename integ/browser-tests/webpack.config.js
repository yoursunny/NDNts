const { FileMatcher } = require("file-matcher");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

const jestPuppeteerConfig = require("./jest-puppeteer.config.js");

/** @type {import("webpack").Configuration} */
const config = {
  mode: "development",
  devtool: "cheap-module-source-map",
  entry: {},
  module: {
    rules: [
      {
        test: /\.ts$/,
        exclude: /node_modules/,
        loader: "ts-loader",
        options: {
          configFile: "tsconfig.webpack.json",
          transpileOnly: true,
        },
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".mjs", ".js"],
    symlinks: true,
  },
  node: false,
  plugins: [
    new ForkTsCheckerWebpackPlugin({
      typescript: {
        configFile: "tsconfig.webpack.json",
      },
    }),
  ],
  devServer: {
    allowedHosts: [
      ".ngrok.io",
    ],
    contentBase: path.resolve(__dirname, "public"),
    host: "0.0.0.0",
    port: jestPuppeteerConfig.server.port,
    headers: {
      "Origin-Trial": "An6rhP9kx5wibLrfVBgGmY3MKPaAlLex0hci5Hu6BRIZ3JhmGKQ6QNFSFcmTaaVugda/PY7NgtQVdfe91e5ogwEAAABPeyJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjkzMjciLCJmZWF0dXJlIjoiV2ViVHJhbnNwb3J0IiwiZXhwaXJ5IjoxNjM0MDgzMTk5fQ==", // Chromium WebTransport origin trial token for http://localhost:9327 expires 2021-06-19
    },
  },
};

module.exports = async () => {
  const list = await new FileMatcher().find({
    path: path.resolve(__dirname, "tests"),
    fileFilter: {
      fileNamePattern: "**/browser.ts",
    },
    recursiveSearch: true,
  });
  for (const filename of list) {
    const name = path.basename(path.dirname(filename));
    config.entry[name] = filename;
    config.plugins.push(new HtmlWebpackPlugin({
      chunks: [name],
      filename: `${name}.html`,
      title: name,
    }));
  }
  return config;
};
