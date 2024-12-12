import type { FwFace } from "@ndn/fw";
import { Name } from "@ndn/packet";
import { makePSyncCompatParam, PartialSubscriber, type SyncUpdate } from "@ndn/psync";
import { WsTransport } from "@ndn/ws-transport";

import type { UpdateRecord } from "./api";

let face: FwFace;
let sub: PartialSubscriber;
let updates: UpdateRecord[];

function saveUpdate(update: SyncUpdate<unknown>): void {
  for (const seqNum of update.seqNums()) {
    updates.push({ topic: `${update.node.id}`, seqNum });
  }
}

globalThis.startPSyncPartial = async (uri) => {
  face = await WsTransport.createFace({}, uri);
  sub = new PartialSubscriber({
    p: makePSyncCompatParam(),
    syncPrefix: new Name("/psync-test"),
    syncInterestLifetime: 100,
    syncInterestInterval: [110, 150],
  });
  updates = [];

  sub.addEventListener("state", ({ topics }) => {
    for (const topic of topics) {
      if (!topic.prefix.equals("/P/2")) {
        continue;
      }
      const subscription = sub.subscribe(topic);
      subscription.addEventListener("update", saveUpdate);
    }
  });
};

globalThis.endPSyncPartial = async () => {
  face.close();
  return updates;
};
