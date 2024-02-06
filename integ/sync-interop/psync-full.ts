import { exitClosers, openUplinks } from "@ndn/cli-common";
import { Name } from "@ndn/packet";
import { makePSyncCompatParam, PSyncFull, PSyncZlib } from "@ndn/psync";
import { console } from "@ndn/util";

const syncPrefix = new Name("/psync-interop");
const ownName = new Name(`/psync-NDNts/${Date.now()}`);

await openUplinks();

const sync = new PSyncFull({
  p: makePSyncCompatParam({
    expectedEntries: 80,
    ibltCompression: PSyncZlib,
    contentCompression: PSyncZlib,
  }),
  syncPrefix,
});
exitClosers.push(sync);

sync.addEventListener("update", ({ id, loSeqNum, hiSeqNum }) => {
  console.log(`UPDATE ${id} ${loSeqNum}${loSeqNum === hiSeqNum ? "" : `..${hiSeqNum}`}`);
});

const node = sync.add(ownName);
exitClosers.addTimeout(setInterval(() => {
  node.seqNum++;
  console.log(`PUBLISH ${ownName} ${node.seqNum}`);
}, 5000));
