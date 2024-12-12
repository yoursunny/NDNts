import "./api";
import "@ndn/packet/test-fixture/expect";

import { Name } from "@ndn/packet";
import { makePSyncCompatParam, PartialPublisher } from "@ndn/psync";
import { Closers, delay } from "@ndn/util";
import { WsTransport } from "@ndn/ws-transport";
import { WsServer } from "@ndn/ws-transport/test-fixture/ws-server";
import { beforeEach, expect, test } from "vitest";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";

const closers = new Closers();
let server: WsServer;
beforeEach(async () => {
  server = await new WsServer().open();
  closers.push(server);
  await navigateToPage(import.meta.url);

  return closers.close;
});

test("PSyncPartial", async () => {
  const pub = new PartialPublisher({
    p: makePSyncCompatParam(),
    syncPrefix: new Name("/psync-test"),
  });
  closers.push(pub);

  await Promise.all([
    pageInvoke<typeof globalThis.startPSyncPartial>("startPSyncPartial", server.uri),
    (async () => {
      const sock = (await server.waitNClients(1))[0]!;
      const face = await WsTransport.createFace({}, sock);
      closers.push(face);
    })(),
  ]);

  const topics = [
    pub.add(new Name("/P/0")),
    pub.add(new Name("/P/1")),
    pub.add(new Name("/P/2")),
    pub.add(new Name("/P/3")),
  ];
  while (topics.length > 0) {
    await delay(100);
    for (const topic of topics) {
      ++topic.seqNum;
    }
    topics.shift();
  }

  await delay(500);
  const updates = await pageInvoke<typeof globalThis.endPSyncPartial>("endPSyncPartial");
  expect(updates).toHaveLength(3);
  expect(updates.map((u) => u.seqNum)).toEqual([1, 2, 3]);
});
