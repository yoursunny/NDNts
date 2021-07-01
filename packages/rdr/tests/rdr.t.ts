import "@ndn/packet/test-fixture/expect";

import { Endpoint } from "@ndn/endpoint";
import { generateSigningKey } from "@ndn/keychain";
import { Closers } from "@ndn/l3face/test-fixture/closers";
import { Version } from "@ndn/naming-convention2";
import { Interest, Name, Signer, Verifier } from "@ndn/packet";
import { Decoder, Extension, NNI, toUtf8 } from "@ndn/tlv";
import AbortController from "abort-controller";

import { Metadata, retrieveMetadata, serveMetadata } from "..";

const simpleMetadata = new Metadata(new Name("/D").append(Version, 2));
let signer: Signer;
let verifier: Verifier;
beforeAll(async () => {
  [signer, verifier] = await generateSigningKey("/K");
});

const closers = new Closers();
afterEach(() => {
  closers.close();
  Endpoint.deleteDefaultForwarder();
});

describe("consumer", () => {
  beforeEach(() => {
    const producer = serveMetadata(simpleMetadata, { prefix: "/R", signer });
    closers.push(producer);
  });

  test("retrieve simple", async () => {
    const metadata = await retrieveMetadata("/R");
    expect(metadata.name).toEqualName(simpleMetadata.name);
  });

  test("retrieve verify", async () => {
    const metadata = await retrieveMetadata("/R", { verifier });
    expect(metadata.name).toEqualName(simpleMetadata.name);
  });

  test("retrieve cancel", async () => {
    const abort = new AbortController();
    const promise = retrieveMetadata("/Z/32=metadata", { signal: abort.signal });
    setTimeout(() => abort.abort(), 10);
    await expect(promise).rejects.toThrow();
  });
});

describe("producer", () => {
  test("serve simple", async () => {
    const p = serveMetadata(simpleMetadata);
    closers.push(p);

    const endpoint = new Endpoint();
    const [data] = await Promise.all([
      endpoint.consume(new Interest("/D/32=metadata", Interest.CanBePrefix, Interest.MustBeFresh)),
      expect(endpoint.consume(new Interest("/D/32=metadata", Interest.CanBePrefix,
        Interest.Lifetime(100)))).rejects.toThrow(),
      expect(endpoint.consume(new Interest("/D/32=metadata", Interest.MustBeFresh,
        Interest.Lifetime(100)))).rejects.toThrow(),
      expect(endpoint.consume(new Interest(new Name("/D/32=metadata").append(Version, 4),
        Interest.CanBePrefix, Interest.MustBeFresh,
        Interest.Lifetime(100)))).rejects.toThrow(),
    ]);

    expect(data.name).toHaveLength(4);
    expect(data.freshnessPeriod).toBe(1);
    const name2 = new Decoder(data.content).decode(Name);
    expect(name2).toEqualName(simpleMetadata.name);
  });

  test("serve with prefix", async () => {
    const makeMetadata = jest.fn<Metadata, []>().mockReturnValue(simpleMetadata);
    const p = serveMetadata(makeMetadata, { prefix: "/R", freshnessPeriod: 100 });
    closers.push(p);

    const data = await new Endpoint().consume(new Interest("/R/32=metadata", Interest.CanBePrefix, Interest.MustBeFresh));
    expect(data.name).toHaveLength(4);
    expect(data.freshnessPeriod).toBe(100);
    const name2 = new Decoder(data.content).decode(Name);
    expect(name2).toEqualName(simpleMetadata.name);

    expect(makeMetadata).toHaveBeenCalled();
    p.close();
  });
});

test("ExtensibleMetadata", async () => {
  const [MetadataA, registryA] = Metadata.makeExtensible("MetadataA");
  registryA.registerExtension<number>({
    tt: 0xA1,
    decode(obj, { nni }, accumulator) {
      return nni;
    },
    encode(obj, value) {
      return [this.tt, NNI(value)];
    },
  });
  const mA = new MetadataA(new Name("/D/A").append(Version, 11));
  Extension.set(mA, 0xA1, 101);

  const [MetadataB, registryB] = Metadata.makeExtensible("MetadataA");
  registryB.registerExtension<string>({
    tt: 0xB1,
    decode(obj, { text }, accumulator) {
      return text;
    },
    encode(obj, value) {
      return [this.tt, toUtf8(value)];
    },
  });
  const mB = new MetadataB(new Name("/D/B").append(Version, 12));
  Extension.set(mB, 0xB1, "bb");

  const pA = serveMetadata(mA);
  const pB = serveMetadata(mB);
  closers.push(pA, pB);

  const [rA0, rAA, rAB, rB0, rBA, rBB] = await Promise.all([
    retrieveMetadata("/D/A"),
    retrieveMetadata("/D/A", { Metadata: MetadataA }),
    retrieveMetadata("/D/A", { Metadata: MetadataB }),
    retrieveMetadata("/D/B"),
    retrieveMetadata("/D/B", { Metadata: MetadataA }),
    retrieveMetadata("/D/B", { Metadata: MetadataB }),
  ]);
  expect(rA0.name).toEqualName(mA.name);
  expect(rAA.name).toEqualName(mA.name);
  expect(rAB.name).toEqualName(mA.name);
  expect(rB0.name).toEqualName(mB.name);
  expect(rBA.name).toEqualName(mB.name);
  expect(rBB.name).toEqualName(mB.name);
  expect(Extension.get(rAA, 0xA1)).toBe(101);
  expect(Extension.get(rAB, 0xB1)).toBeUndefined();
  expect(Extension.get(rBB, 0xB1)).toBe("bb");
  expect(Extension.get(rBA, 0xA1)).toBeUndefined();
});
