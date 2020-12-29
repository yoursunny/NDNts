import { openUplinks } from "@ndn/cli-common";
import { Name } from "@ndn/packet";
import { makePSyncCompatParam, PSyncFull, PSyncZlib } from "@ndn/sync";

const syncPrefix = new Name("/psync-interop");
const ownName = new Name(`/psync-NDNts/${Date.now()}`);

(async () => {
  await openUplinks();

  const sync = new PSyncFull({
    p: makePSyncCompatParam({
      expectedEntries: 80,
      ibltCompression: PSyncZlib,
      contentCompression: PSyncZlib,
    }),
    syncPrefix,
  });

  sync.on("update", ({ id, loSeqNum, hiSeqNum }) => {
    console.log(`UPDATE ${id} ${loSeqNum}${loSeqNum === hiSeqNum ? "" : `..${hiSeqNum}`}`);
  });

  const node = sync.add(ownName);
  setInterval(() => {
    node.seqNum++;
    console.log(`PUBLISH ${ownName} ${node.seqNum}`);
  }, 5000);
})().catch(console.error);
