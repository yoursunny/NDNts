import { exitClosers } from "@ndn/cli-common";
import { console } from "@ndn/util";

import { args, openSvSync } from "./svs-common";

const sync = await openSvSync(false);

sync.addEventListener("update", (update) => {
  const { id, loSeqNum, hiSeqNum } = update;
  console.log(`UPDATE ${id.name}:${id.boot} ${loSeqNum}..${hiSeqNum}`);
});

const node = sync.add(args.me);
exitClosers.addTimeout(setInterval(() => {
  ++node.seqNum;
  console.log(`PUBLISH ${node.id.name}:${node.id.boot} ${node.seqNum}`);
}, 5000));
