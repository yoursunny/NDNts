import { delay } from "@ndn/util";
import Webpack, { type Configuration } from "webpack";
import WebpackDevServer from "webpack-dev-server";

// @ts-expect-error no types
import makeWebpackConfig from "./webpack.config.js";

export default async function setup() {
  const cfg: Configuration = await makeWebpackConfig();
  const compiler = Webpack(cfg);
  const server = new WebpackDevServer(cfg.devServer, compiler);
  await server.start();
  await delay(5000);

  return async () => {
    await server.stop();
  };
}
