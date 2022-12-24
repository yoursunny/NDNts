import { exitClosers, openUplinks } from "@ndn/cli-common";
import { Endpoint } from "@ndn/endpoint";
import { createSigner, createVerifier, HMAC } from "@ndn/keychain";
import { GenericNumber } from "@ndn/naming-convention2";
import { Data, Interest, Name } from "@ndn/packet";
import { SvSync } from "@ndn/sync";
import { console, fromUtf8, toUtf8 } from "@ndn/util";

const syncPrefix = new Name("/ndn/svs");
const myID = new Name(`/${process.pid}-${Date.now()}`);
const myDataPrefix = new Name().append(...myID.comps, ...syncPrefix.comps);

await openUplinks();
const endpoint = new Endpoint({ retx: 2 });
const producer = endpoint.produce(myDataPrefix, async (interest) => {
  const n = interest.name.at(myDataPrefix.length).as(GenericNumber);
  return new Data(interest.name, Data.FreshnessPeriod(1), toUtf8(`NDNts message ${n}`));
});
exitClosers.push(producer);

const key = await HMAC.cryptoGenerate({
  importRaw: Buffer.from("dGhpcyBpcyBhIHNlY3JldCBtZXNzYWdl", "base64"),
}, false);
const sync = new SvSync({
  syncPrefix,
  signer: createSigner(HMAC, key),
  verifier: createVerifier(HMAC, key),
});
exitClosers.push(sync);
sync.on("update", (update) => {
  const { id, loSeqNum, hiSeqNum } = update;
  console.log(`UPDATE ${id.text} ${loSeqNum}..${hiSeqNum}`);
  for (const seqNum of update.seqNums()) {
    void (async () => {
      try {
        const name = id.name.append(...syncPrefix.comps, GenericNumber.create(seqNum));
        const interest = new Interest(name, Interest.CanBePrefix, Interest.Lifetime(2000));
        const data = await endpoint.consume(interest);
        console.log(`MSG ${id.text}:${seqNum} ${fromUtf8(data.content)}`);
      } catch (err: unknown) {
        console.warn(`FETCH-ERR ${id.text}:${seqNum} ${err}`);
      }
    })();
  }
});

const node = sync.add(myID);
exitClosers.addTimeout(setInterval(() => {
  node.seqNum++;
  console.log(`PUBLISH ${myID} ${node.seqNum}`);
}, 5000));
