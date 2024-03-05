import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { consume } from "@ndn/endpoint";
import { Consumer } from "@ndn/nac";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { Interest, Name, noopSigning } from "@ndn/packet";
import { console, fromUtf8 } from "@ndn/util";

await openUplinks();
const keyChain = new NdnsecKeyChain({ importOptions: { preferRSAOAEP: true } });
const [memberKeyName] = await keyChain.listKeys(new Name("/member/KEY"));
if (!memberKeyName) {
  throw new Error("member key not found");
}
const memberDecrypter = await keyChain.getKey(memberKeyName, "decrypter");
console.log("member key name", memberDecrypter.name.toString());

const data = await consume(new Interest(`/example/testApp/${Math.random()}`, Interest.CanBePrefix));
console.log("retrieved Data name", data.name.toString());

const c = Consumer.create({
  verifier: noopSigning,
  memberDecrypter,
});
await c.decrypt(data);
console.log("decrypted Data payload", fromUtf8(data.content));
closeUplinks();
