const { FileMatcher } = require("file-matcher");
const ForkTsCheckerWebpackPlugin = require("fork-ts-checker-webpack-plugin");
const HtmlWebpackPlugin = require("html-webpack-plugin");
const path = require("path");

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
    fallback: {
      events: require.resolve("events/"),
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
