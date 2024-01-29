import "@ndn/packet/test-fixture/expect";

import { generateSigningKey, KeyChain } from "@ndn/keychain";
import { FakeNfd } from "@ndn/nfdmgmt/test-fixture/prefix-reg";
import { Data, type Name } from "@ndn/packet";
import { Closers } from "@ndn/util";
import { dirSync as tmpDir } from "tmp";
import { afterAll, expect, test } from "vitest";

const closers = new Closers();
afterAll(closers.close);

const tmpKeyChain = tmpDir({ unsafeCleanup: true });
afterAll(tmpKeyChain.removeCallback);
let signerName: Name;
{
  const keyChain = KeyChain.open(tmpKeyChain.name);
  const [signerPvt] = await generateSigningKey(keyChain, "/key-signer");
  signerName = signerPvt.name;
}
process.env.NDNTS_KEYCHAIN = tmpKeyChain.name;
process.env.NDNTS_KEY = "/key-signer";

const nfd = await new FakeNfd().open();
closers.push(nfd);
process.env.NDNTS_UPLINK = `tcp://127.0.0.1:${nfd.port}`;

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
