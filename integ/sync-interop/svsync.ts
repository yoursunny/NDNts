import { exitClosers } from "@ndn/cli-common";
import { console } from "@ndn/util";

import { myID, openSvSync } from "./svs-common";

const sync = await openSvSync(false);

sync.addEventListener("update", (update) => {
  const { id, loSeqNum, hiSeqNum } = update;
  console.log(`UPDATE ${id} ${loSeqNum}..${hiSeqNum}`);
});

const node = sync.add(myID);
exitClosers.addTimeout(setInterval(() => {
  node.seqNum++;
  console.log(`PUBLISH ${myID} ${node.seqNum}`);
}, 5000));
