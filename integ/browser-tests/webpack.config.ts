import "webpack-dev-server";

import { FileMatcher } from "file-matcher";
import ForkTsCheckerWebpackPlugin from "fork-ts-checker-webpack-plugin";
import HtmlWebpackPlugin from "html-webpack-plugin";
import * as path from "path";
import webpack from "webpack";

import jestPuppeteerConfig from "./jest-puppeteer.config.js";

const entry: webpack.Entry = {};
const plugins: webpack.Plugin[] = [];

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
} as webpack.Configuration;

config.devServer = {
  allowedHosts: [
    ".ngrok.io",
  ],
  contentBase: path.join(__dirname, "public"),
  host: "0.0.0.0",
  port: jestPuppeteerConfig.server.port,
};

export = async () => {
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
