import { openUplinks } from "@ndn/cli-common";
import { Endpoint } from "@ndn/endpoint";
import { generateEncryptionKey, generateSigningKey, RSAOAEP } from "@ndn/keychain";
import { AccessManager, Producer } from "@ndn/nac";
import { NdnsecKeyChain } from "@ndn/ndnsec";
import { Data, Name } from "@ndn/packet";
import { DataStore, PrefixRegStatic, RepoProducer } from "@ndn/repo";
import { toUtf8 } from "@ndn/util";
import memdown from "memdown";

(async () => {
  await openUplinks();
  const keyChain = new NdnsecKeyChain({ importOptions: { preferRSAOAEP: true } });
  const [memberKeyName] = await keyChain.listKeys(new Name("/member/KEY"));
  const memberEncrypter = await keyChain.getKey(memberKeyName, "encrypter");
  console.log("member key name", memberEncrypter.name.toString());

  const dataStore = new DataStore(memdown());
  RepoProducer.create(dataStore, {
    reg: PrefixRegStatic(new Name("/nac/example"), new Name("/example/testApp")),
  });

  const [amSigner] = await generateSigningKey("/am");
  const [ownKdkEncrypter, ownKdkDecrypter] = await generateEncryptionKey("/am/kdk-encrypt", RSAOAEP);
  const am = AccessManager.create({
    dataStore,
    prefix: new Name("/nac/example/am"),
    keys: {
      signer: amSigner,
      ownKdkEncrypter,
      ownKdkDecrypter,
    },
  });
  const kekHandle = await am.createKek(new Name("/test"));
  await kekHandle.grant(memberEncrypter);

  const [pSigner] = await generateSigningKey("/producer");
  const p = Producer.create({
    dataStore,
    ckPrefix: new Name("/nac/example/CK"),
    signer: pSigner,
  });
  const pEncrypter = await p.createEncrypter(kekHandle.kek);
  new Endpoint().produce("/example/testApp", async (interest) => {
    const data = new Data(interest.name.append("testApp", Math.random().toString()));
    data.freshnessPeriod = 1;
    data.content = toUtf8("NDNts @ndn/nac interop test");
    await pEncrypter.encrypt(data);
    console.log("producing Data name", data.name.toString());
    return data;
  });

  console.log("ready");
})().catch(console.error);
