import { exitClosers, openUplinks } from "@ndn/cli-common";
import { Endpoint } from "@ndn/endpoint";
import { createSigner, createVerifier, HMAC } from "@ndn/keychain";
import { Data, Name } from "@ndn/packet";
import { SvSync } from "@ndn/sync";
import { NNI, toUtf8 } from "@ndn/tlv";

const syncPrefix = new Name("/ndn/svs");
const myID = new Name(`/${Date.now()}`);
const myDataPrefix = new Name().append(...myID.comps, ...syncPrefix.comps);

await openUplinks();
new Endpoint().produce(myDataPrefix, async (interest) => {
  const n = NNI.decode(interest.name.at(myDataPrefix.length).value, { big: true });
  return new Data(interest.name, Data.FreshnessPeriod(1), toUtf8(`NDNts message ${n}`));
});

const key = await HMAC.cryptoGenerate({
  importRaw: Buffer.from("dGhpcyBpcyBhIHNlY3JldCBtZXNzYWdl", "base64"),
}, false);
const sync = new SvSync({
  syncPrefix,
  signer: await createSigner(HMAC, key),
  verifier: await createVerifier(HMAC, key),
});
exitClosers.push(sync);
sync.on("update", ({ id, loSeqNum, hiSeqNum }) => {
  console.log(`UPDATE ${id.text} ${loSeqNum}${loSeqNum === hiSeqNum ? "" : `..${hiSeqNum}`}`);
});

const node = sync.add(myID);
exitClosers.addTimeout(setInterval(() => {
  node.seqNum++;
  console.log(`PUBLISH ${myID} ${node.seqNum}`);
}, 5000));
