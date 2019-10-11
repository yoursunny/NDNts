import { execute as testTransport } from "@ndn/l3face/test-fixture/transport";
import { WsTransport } from "@ndn/ws-transport";

import "./api";

window.testWsTransportPair = async (wsUri) => {
  const [transportA, transportB] = await Promise.all([
    WsTransport.connect(wsUri),
    WsTransport.connect(wsUri),
  ]);
  return await testTransport(transportA, transportB);
};
