import "./api";
import "@ndn/packet/test-fixture/expect";

import type { FwFace } from "@ndn/fw";
import { Name } from "@ndn/packet";
import { makePSyncCompatParam, PSyncPartialPublisher } from "@ndn/sync";
import { delay } from "@ndn/util";
import { WsTransport } from "@ndn/ws-transport";
import { WsServer } from "@ndn/ws-transport/test-fixture/ws-server";
import { beforeEach, expect, test } from "vitest";

import { navigateToPage, pageInvoke } from "../../test-fixture/pptr";

let server: WsServer;
let face: FwFace | undefined;
let pub: PSyncPartialPublisher | undefined;

beforeEach(async () => {
  server = new WsServer();
  await server.open();
  await navigateToPage(__dirname);

  return async () => {
    face?.close();
    pub?.close();
    await server.close();
  };
});

test("PSyncPartial", async () => {
  pub = new PSyncPartialPublisher({
    p: makePSyncCompatParam(),
    syncPrefix: new Name("/psync-test"),
  });

  await Promise.all([
    pageInvoke<typeof window.startPSyncPartial>("startPSyncPartial", server.uri),
    (async () => {
      const sock = (await server.waitNClients(1))[0]!;
      face = await WsTransport.createFace({}, sock);
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
  const updates = await pageInvoke<typeof window.endPSyncPartial>("endPSyncPartial");
  expect(updates).toHaveLength(3);
  expect(updates.map((u) => u.seqNum)).toEqual([1, 2, 3]);
});
