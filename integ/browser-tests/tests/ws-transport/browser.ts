import { execute as testTransport } from "@ndn/llface/test-fixture/transport";
import { WsTransport } from "@ndn/ws-transport";

import "./api";

window.main = async (wsUri) => {
  const [transportA, transportB] = await Promise.all([
    WsTransport.connect(wsUri),
    WsTransport.connect(wsUri),
  ]);
  return await testTransport(transportA, transportB);
};
