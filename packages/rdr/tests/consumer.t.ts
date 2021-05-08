import "@ndn/packet/test-fixture/expect";

import { Endpoint, Producer } from "@ndn/endpoint";
import { generateSigningKey } from "@ndn/keychain";
import { Version } from "@ndn/naming-convention2";
import { Name, Signer, Verifier } from "@ndn/packet";
import AbortController from "abort-controller";

import { retrieveMetadata, serveMetadata } from "..";

let signer: Signer;
let verifier: Verifier;
beforeAll(async () => {
  [signer, verifier] = await generateSigningKey("/K");
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
  const abort = new AbortController();
  const promise = retrieveMetadata("/Z/32=metadata", { signal: abort.signal });
  setTimeout(() => abort.abort(), 10);
  await expect(promise).rejects.toThrow();
});
