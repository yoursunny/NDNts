import { closeUplinks, openUplinks } from "@ndn/cli-common";
import { Endpoint } from "@ndn/endpoint";
import { Consumer } from "@ndn/nac";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { Interest, Name } from "@ndn/packet";
import { fromUtf8 } from "@ndn/util";

(async () => {
  await openUplinks();
  const keyChain = new NdnsecKeyChain({ importOptions: { preferRSAOAEP: true } });
  const [memberKeyName] = await keyChain.listKeys(new Name("/member/KEY"));
  const memberDecrypter = await keyChain.getKey(memberKeyName, "decrypter");
  console.log("member key name", memberDecrypter.name.toString());

  const data = await new Endpoint().consume(new Interest(`/example/testApp/${Math.random()}`, Interest.CanBePrefix));
  console.log("retrieved Data name", data.name.toString());

  const c = Consumer.create({
    verifier: {
      verify: () => Promise.resolve(),
    },
    memberDecrypter,
  });
  await c.decrypt(data);
  console.log("decrypted Data payload", fromUtf8(data.content));
})().catch(console.error).finally(closeUplinks);
