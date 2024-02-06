import { exitClosers } from "@ndn/cli-common";
import { Timestamp } from "@ndn/naming-convention2";
import { digestSigning, Name } from "@ndn/packet";
import { DataStore } from "@ndn/repo";
import { SvPublisher } from "@ndn/svs";
import { console, crypto, toHex, toUtf8 } from "@ndn/util";
import memdown from "memdown";

import { myID, openSvSync } from "./svs-common";

const sync = await openSvSync();
const pub = new SvPublisher({
  sync,
  id: myID,
  store: new DataStore(memdown()),
  innerSigner: digestSigning,
  outerSigner: digestSigning,
  mappingSigner: digestSigning,
});
exitClosers.push(pub);

const nameChat = new Name("/chat");

exitClosers.addTimeout(setInterval(async () => {
  const name = nameChat.append(...myID.comps, Timestamp.us.create(new Date()));
  const msg = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const seqNum = await pub.publish(name, toUtf8(msg));
  console.log(`PUBLISH ${seqNum} ${name} ${msg}`);
}, 5000));
