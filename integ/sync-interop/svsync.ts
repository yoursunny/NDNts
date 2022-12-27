import { exitClosers } from "@ndn/cli-common";
import { Endpoint } from "@ndn/endpoint";
import { GenericNumber } from "@ndn/naming-convention2";
import { Data, Interest } from "@ndn/packet";
import { console, fromUtf8, toUtf8 } from "@ndn/util";

import { myDataPrefix, myID, openSvSync, syncPrefix } from "./svs-common";

const sync = await openSvSync();

const endpoint = new Endpoint({ retx: 2 });
const producer = endpoint.produce(myDataPrefix, async (interest) => {
  const n = interest.name.at(myDataPrefix.length).as(GenericNumber);
  return new Data(interest.name, Data.FreshnessPeriod(1), toUtf8(`NDNts message ${n}`));
});
exitClosers.push(producer);

sync.on("update", (update) => {
  const { id, loSeqNum, hiSeqNum } = update;
  console.log(`UPDATE ${id} ${loSeqNum}..${hiSeqNum}`);
  for (const seqNum of update.seqNums()) {
    void (async () => {
      try {
        const name = id.append(...syncPrefix.comps, GenericNumber.create(seqNum));
        const interest = new Interest(name, Interest.CanBePrefix, Interest.Lifetime(2000));
        const data = await endpoint.consume(interest);
        console.log(`MSG ${id}:${seqNum} ${fromUtf8(data.content)}`);
      } catch (err: unknown) {
        console.warn(`FETCH-ERR ${id}:${seqNum} ${err}`);
      }
    })();
  }
});

const node = sync.add(myID);
exitClosers.addTimeout(setInterval(() => {
  node.seqNum++;
  console.log(`PUBLISH ${myID} ${node.seqNum}`);
}, 5000));
