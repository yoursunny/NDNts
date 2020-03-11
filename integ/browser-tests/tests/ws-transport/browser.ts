import { execute as testTransport } from "@ndn/l3face/test-fixture/transport";
import { WsTransport } from "@ndn/ws-transport";

import "./api";

let transportA: WsTransport;
let transportB: WsTransport;

window.connectWsTransportPair = async (uri) => {
  [transportA, transportB] = await Promise.all([
    WsTransport.connect(uri),
    WsTransport.connect(uri),
  ]);
};

window.testWsTransportPair = async () => {
  return testTransport(transportA, transportB);
};
