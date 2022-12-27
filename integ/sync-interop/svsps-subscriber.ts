import { exitClosers } from "@ndn/cli-common";
import { digestSigning, Name } from "@ndn/packet";
import { SvSubscriber } from "@ndn/sync";
import { console, fromUtf8 } from "@ndn/util";

import { openSvSync } from "./svs-common";

const sync = await openSvSync();
const sub = new SvSubscriber({
  sync,
  innerVerifier: digestSigning,
  outerVerifier: digestSigning,
  mappingVerifier: digestSigning,
});
sub.on("error", (err) => console.error(`SUB-ERR ${err}`));
exitClosers.push(sub);

sub.subscribe(new Name("/chat")).on("update", ({ publisher, seqNum, name, payload }) => {
  console.log(`MSG ${publisher}:${seqNum} ${name} ${fromUtf8(payload)}`);
});
