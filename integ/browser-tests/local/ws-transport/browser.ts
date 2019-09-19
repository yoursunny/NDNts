import { execute as testTransport } from "@ndn/llface/test-fixture/transport";
import { WsTransport } from "@ndn/ws-transport";

import { Args, Result } from "./types";

async function execute(args: Args): Promise<Result> {
  const [transportA, transportB] = await Promise.all([
    WsTransport.connect(args.wsUri),
    WsTransport.connect(args.wsUri),
  ]);
  return await testTransport(transportA, transportB);
}

function main(args: Args, callback: (result: Result|string) => any) {
  execute(args)
  .then((result) => callback(result))
  .catch((error: Error) => callback(error.toString()));
}

(window as any).main = main;
