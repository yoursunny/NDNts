import "./api";

import { execute as testTransport } from "@ndn/l3face/test-fixture/transport";
import { WsTransport } from "@ndn/ws-transport";

let transportA: WsTransport;
let transportB: WsTransport;

globalThis.connectWsTransportPair = async (uri) => {
  [transportA, transportB] = await Promise.all([
    WsTransport.connect(uri),
    WsTransport.connect(uri),
  ]);
};

globalThis.testWsTransportPair = async () => testTransport(transportA, transportB);
