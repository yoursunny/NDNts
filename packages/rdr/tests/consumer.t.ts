import "@ndn/packet/test-fixture/expect";

import { Endpoint, Producer } from "@ndn/endpoint";
import { EcPrivateKey, PrivateKey, PublicKey } from "@ndn/keychain";
import { Version } from "@ndn/naming-convention2";
import { Name } from "@ndn/packet";

import { retrieveMetadata, serveMetadata } from "..";

let signer: PrivateKey;
let verifier: PublicKey;
beforeAll(async () => {
  [signer, verifier] = await EcPrivateKey.generate("/K", "P-256");
});

const theMetadata = {
  name: new Name("/D").append(Version, 2),
};
let producer: Producer;

beforeEach(() => {
  producer = serveMetadata(theMetadata, { prefix: "/R", signer });
});

afterEach(() => {
  producer.close();
  Endpoint.deleteDefaultForwarder();
});

test("retrieve simple", async () => {
  const metadata = await retrieveMetadata("/R");
  expect(metadata.name).toEqualName(theMetadata.name);
});

test("retrieve verify", async () => {
  const metadata = await retrieveMetadata("/R", { verifier });
  expect(metadata.name).toEqualName(theMetadata.name);
});

test("retrieve cancel", async () => {
  const promise = retrieveMetadata("/Z/32=metadata");
  setTimeout(() => promise.cancel(), 10);
  await expect(promise).rejects.toThrow();
});
