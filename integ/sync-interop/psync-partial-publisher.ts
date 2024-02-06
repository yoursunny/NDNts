import { exitClosers, openUplinks } from "@ndn/cli-common";
import { Name } from "@ndn/packet";
import { makePSyncCompatParam, PSyncPartialPublisher, PSyncZlib, type SyncNode } from "@ndn/psync";
import { console } from "@ndn/util";

const syncPrefix = new Name("/psync-interop");
const ownPrefix = new Name(`/psync-NDNts/${Date.now()}`);

await openUplinks();

const sync = new PSyncPartialPublisher({
  p: makePSyncCompatParam({
    ibltCompression: PSyncZlib,
  }),
  syncPrefix,
});
exitClosers.push(sync);
if (process.env.NDNTS_SYNC_DEBUG === "1") {
  sync.addEventListener("debug", ({ detail: { action, interestName } }) => {
    console.log(`DEBUG ${action} ${interestName ?? ""}`);
  });
}

const nodes: Array<SyncNode<Name>> = [];
for (let i = 0; i < 16; ++i) {
  nodes.push(sync.add(ownPrefix.append(`${i}`)));
}

exitClosers.addTimeout(setInterval(() => {
  const node = nodes[Math.trunc(Math.random() * nodes.length)]!;
  node.seqNum++;
  console.log(`PUBLISH ${node.id} ${node.seqNum}`);
}, 2000));
