import "./api";
import "@ndn/packet/test-fixture/expect";

import { FwFace } from "@ndn/fw";
import { Name } from "@ndn/packet";
import { makePSyncCompatParam, PSyncPartialPublisher } from "@ndn/sync";
import { WsTransport } from "@ndn/ws-transport";
import * as WsTest from "@ndn/ws-transport/test-fixture/wss";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";

let face: FwFace|undefined;
let pub: PSyncPartialPublisher|undefined;

beforeEach(() => Promise.all([
  WsTest.createServer(),
  navigateToPage(__dirname),
]));

afterEach(() => {
  face?.close();
  pub?.close();
  WsTest.destroyServer();
});

test("PSyncPartial", async () => {
  pub = new PSyncPartialPublisher({
    p: makePSyncCompatParam(),
    syncPrefix: new Name("/psync-test"),
  });

  await Promise.all([
    pageInvoke<typeof window.startPSyncPartial>(page, "startPSyncPartial", WsTest.uri),
    (async () => {
      const sock = (await WsTest.waitNClients(1))[0]!;
      face = await WsTransport.createFace({}, sock);
      face.addRoute(new Name());
    })(),
  ]);

  const topics = [
    pub.add(new Name("/P/0")),
    pub.add(new Name("/P/1")),
    pub.add(new Name("/P/2")),
    pub.add(new Name("/P/3")),
  ];
  while (topics.length > 0) {
    await new Promise((r) => setTimeout(r, 100));
    for (const topic of topics) {
      ++topic.seqNum;
    }
    topics.shift();
  }

  await new Promise((r) => setTimeout(r, 500));
  const updates = await pageInvoke<typeof window.endPSyncPartial>(page, "endPSyncPartial");
  expect(updates).toHaveLength(3);
  expect(updates.map((u) => u.seqNum)).toEqual([1, 2, 3]);
});
