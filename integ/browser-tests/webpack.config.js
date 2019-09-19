const fs = require("fs");
const path = require("path");
const TsconfigPathsPlugin = require('tsconfig-paths-webpack-plugin');

const configs = [];

["local"].forEach((category) => {
  const categoryPath = path.resolve(__dirname, category);
  const entry = {};
  fs.readdirSync(categoryPath).forEach((testName) => {
    const browserTs = path.join(categoryPath, testName, "browser.ts");
    if (fs.existsSync(browserTs)) {
      entry[testName] = browserTs;
    }
  });

  configs.push({
    name: category,
    entry,
    mode: "development",
    devtool: "cheap-module-eval-source-map",
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          loader: "ts-loader",
          options: {
            configFile: "tsconfig.webpack.json",
          },
        }
      ],
    },
    resolve: {
      extensions: [".ts", ".js"],
      plugins: [
        new TsconfigPathsPlugin({ configFile: "./tsconfig.webpack.json" }),
      ],
      symlinks: true,
    },
    output: {
      filename: "[name].js",
      path: path.join(categoryPath, "bundle"),
    },
  });
});

module.exports = configs;
