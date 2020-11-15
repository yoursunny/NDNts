const { FileMatcher } = require("file-matcher");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

const jestPuppeteerConfig = require("./jest-puppeteer.config.js");

/** @type {import("webpack").Configuration} */
const config = {
  mode: "development",
  devtool: "eval-cheap-module-source-map",
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
      "Origin-Trial": "Aogqh6oLPT2o/71FmPRlTsLs17gPv05kq2YOiA+2NYeFQEqJPQTikpV0DDqVJLXfGlGD6EnUhwtsCkcL6oSBkAQAAABQeyJvcmlnaW4iOiJodHRwOi8vbG9jYWxob3N0OjkzMjciLCJmZWF0dXJlIjoiUXVpY1RyYW5zcG9ydCIsImV4cGlyeSI6MTYwODk0NzcyMn0=", // Chromium QuicTransport origin trial token for http://localhost:9327
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
  list.forEach((filename) => {
    const name = path.basename(path.dirname(filename));
    config.entry[name] = filename;
    config.plugins.push(new HtmlWebpackPlugin({
      chunks: [name],
      filename: `${name}.html`,
      title: name,
    }));
  });
  return config;
};
