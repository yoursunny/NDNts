import "webpack-dev-server";

import { FileMatcher } from "file-matcher";
import HtmlWebpackPlugin from "html-webpack-plugin";
import * as path from "path";
import TsconfigPathsPlugin from "tsconfig-paths-webpack-plugin";
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
        exclude: /node_modules/,
        loader: "ts-loader",
        options: {
          configFile: "tsconfig.webpack.json",
        },
        test: /\.ts$/,
      },
    ],
  },
  resolve: {
    extensions: [".ts", ".js"],
    plugins: [
      new TsconfigPathsPlugin({ configFile: "tsconfig.webpack.json" }),
    ],
    symlinks: true,
  },
} as webpack.Configuration;

config.devServer = {
  contentBase: path.join(__dirname, "public"),
  hot: false,
  port: jestPuppeteerConfig.server.port,
};
(config.devServer as any).liveReload = false;

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
