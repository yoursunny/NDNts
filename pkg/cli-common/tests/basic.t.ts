import "@ndn/packet/test-fixture/expect";

import { generateSigningKey, KeyChain } from "@ndn/keychain";
import { FakeNfd } from "@ndn/nfdmgmt/test-fixture/prefix-reg";
import { Data, type Name } from "@ndn/packet";
import { Closers, delay } from "@ndn/util";
import { makeTmpDir } from "@ndn/util/test-fixture/tmp";
import { afterAll, expect, test } from "vitest";

const closers = new Closers();
afterAll(closers.close);

const tmpDir = makeTmpDir();
closers.push(tmpDir); // `using tmpDir` seems to cause premature cleanup
const keyChainDir = tmpDir.join("keychain");
let signerName: Name;
{
  const keyChain = KeyChain.open(keyChainDir);
  const [signerPvt] = await generateSigningKey(keyChain, "/key-signer");
  signerName = signerPvt.name;
}
process.env.NDNTS_KEYCHAIN = keyChainDir;
process.env.NDNTS_KEY = "/key-signer";

const nfd = await new FakeNfd().open();
closers.push(nfd);
process.env.NDNTS_UPLINK = `tcp://127.0.0.1:${nfd.port}`;

await delay(250); // allow time for writing keychain to disk
const { openUplinks, getSigner } = await import("..");

test("openKeyChain", async () => {
  const signer = await getSigner();
  const data = new Data();
  await signer.sign(data);
  expect(data.sigInfo.keyLocator?.name).toEqualName(signerName);
});

test("openUplinks", async () => {
  const uplinks = await openUplinks();
  expect(uplinks).toHaveLength(1);
  expect(nfd.clients.size).toBe(1);
  expect(uplinks[0]?.toString()).toContain(`127.0.0.1:${nfd.port}`);
});
