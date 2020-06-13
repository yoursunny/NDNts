const { FileMatcher } = require("file-matcher");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

const jestPuppeteerConfig = require("./jest-puppeteer.config.js");

/** @type {import("webpack").Entry} */
const entry = {};
/** @type {import("webpack").Plugin[]} */
const plugins = [];

/** @type {import("webpack").Configuration} */
const config = {
  mode: "development",
  devtool: "cheap-module-eval-source-map",
  output: {
    filename: "[name].js",
  },
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
    extensions: [".ts", ".js"],
    symlinks: true,
  },
  plugins: [
    new ForkTsCheckerWebpackPlugin({ tsconfig: "tsconfig.webpack.json" }),
  ],
};

/** @type {import("webpack-dev-server").Configuration} */
config.devServer = {
  allowedHosts: [
    ".ngrok.io",
  ],
  contentBase: path.join(__dirname, "public"),
  host: "0.0.0.0",
  port: jestPuppeteerConfig.server.port,
};

module.exports = async () => {
  const list = await new FileMatcher().find({
    path: path.resolve(__dirname, "tests"),
    fileFilter: {
      fileNamePattern: "**/browser.ts",
    },
    recursiveSearch: true,
  });
  list.forEach((filename) => {
    const name = path.basename(path.dirname(filename));
    entry[name] = filename;
    plugins.push(new HtmlWebpackPlugin({
      chunks: [name],
      filename: `${name}.html`,
      title: name,
    }));
  });

  config.entry = entry;
  config.plugins = plugins;
  return config;
};
