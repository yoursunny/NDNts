const path = require("node:path");
const fsWalk = require("@nodelib/fs.walk/promises");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");

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
    alias: {
      vitest: false,
    },
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
    allowedHosts: "all",
    host: "::",
    port: 9327,
    webSocketServer: false,
  },
};

module.exports = async () => { // eslint-disable-line unicorn/no-anonymous-default-export
  const list = await fsWalk.walk(path.resolve(__dirname, "tests"), {
    entryFilter: ({ name }) => name === "browser.ts",
  });
  for (const { path: filename } of list) {
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
