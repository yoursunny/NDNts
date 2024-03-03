import "@ndn/packet/test-fixture/expect";

import { consume } from "@ndn/endpoint";
import { Forwarder } from "@ndn/fw";
import { generateSigningKey } from "@ndn/keychain";
import { Version } from "@ndn/naming-convention2";
import { Interest, Name, type Signer, type Verifier } from "@ndn/packet";
import { Decoder, Extensible, Extension, ExtensionRegistry, NNI, StructFieldNNI, StructFieldText } from "@ndn/tlv";
import { Closers } from "@ndn/util";
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from "vitest";

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
  Forwarder.deleteDefault();
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
    const promise = retrieveMetadata("/Z/32=metadata", { signal: AbortSignal.timeout(10) });
    await expect(promise).rejects.toThrow();
  });
});

describe("producer", () => {
  test("serve simple", async () => {
    const p = serveMetadata(simpleMetadata);
    closers.push(p);

    const [data] = await Promise.all([
      consume(new Interest("/D/32=metadata", Interest.CanBePrefix, Interest.MustBeFresh)),
      expect(consume(new Interest("/D/32=metadata", Interest.CanBePrefix,
        Interest.Lifetime(100)))).rejects.toThrow(),
      expect(consume(new Interest("/D/32=metadata", Interest.MustBeFresh,
        Interest.Lifetime(100)))).rejects.toThrow(),
      expect(consume(new Interest(new Name("/D/32=metadata").append(Version, 4),
        Interest.CanBePrefix, Interest.MustBeFresh,
        Interest.Lifetime(100)))).rejects.toThrow(),
    ]);

    expect(data.name).toHaveLength(4);
    expect(data.freshnessPeriod).toBe(1);
    const name2 = Decoder.decode(data.content, Name);
    expect(name2).toEqualName(simpleMetadata.name);
  });

  test("serve with prefix", async () => {
    const makeMetadata = vi.fn<[], Metadata>().mockReturnValue(simpleMetadata);
    const p = serveMetadata(makeMetadata, { prefix: "/R", freshnessPeriod: 100 });
    closers.push(p);

    const data = await consume(new Interest("/R/32=metadata", Interest.CanBePrefix, Interest.MustBeFresh));
    expect(data.name).toHaveLength(4);
    expect(data.freshnessPeriod).toBe(100);
    const name2 = Decoder.decode(data.content, Name);
    expect(name2).toEqualName(simpleMetadata.name);

    expect(makeMetadata).toHaveBeenCalled();
    p.close();
  });
});

test("ExtensibleMetadata", async () => {
  const registryA: ExtensionRegistry<MetadataA> = new ExtensionRegistry<MetadataA>();
  registryA.register(0xA1, StructFieldNNI);

  @Metadata.extend
  class MetadataA extends Metadata implements Extensible {
    public readonly [Extensible.TAG] = registryA;

    public get a1(): number {
      return Extension.get(this, 0xA1) as (number | undefined) ?? 0;
    }

    public set a1(v: number) {
      Extension.set(this, 0xA1, v);
    }
  }

  const registryB: ExtensionRegistry<MetadataB> = new ExtensionRegistry<MetadataB>();
  registryB.register(0xB1, StructFieldText);

  @Metadata.extend
  class MetadataB extends Metadata implements Extensible {
    public readonly [Extensible.TAG] = registryB;

    public get b1(): string {
      return Extension.get(this, 0xB1) as (string | undefined) ?? "";
    }

    public set b1(v: string) {
      Extension.set(this, 0xB1, v);
    }
  }

  const mA = new MetadataA(new Name("/D/A").append(Version, 11));
  mA.a1 = 101;

  const mB = new MetadataB(new Name("/D/B").append(Version, 12));
  mB.b1 = "bb";

  const pA = serveMetadata(mA, { signer });
  const pB = serveMetadata(mB);
  closers.push(pA, pB);

  const [rA0, rAA, rAB, rB0, rBA, rBB] = await Promise.all([
    retrieveMetadata("/D/A", { verifier }),
    retrieveMetadata("/D/A", MetadataA, { verifier }),
    retrieveMetadata("/D/A", MetadataB),
    retrieveMetadata("/D/B"),
    retrieveMetadata("/D/B", MetadataA),
    retrieveMetadata("/D/B", MetadataB),
  ]);
  expect(rA0.name).toEqualName(mA.name);
  expect(rAA.name).toEqualName(mA.name);
  expect(rAB.name).toEqualName(mA.name);
  expect(rB0.name).toEqualName(mB.name);
  expect(rBA.name).toEqualName(mB.name);
  expect(rBB.name).toEqualName(mB.name);
  expect(rAA.a1).toBe(101);
  expect(rAB.b1).toBe("");
  expect(rBB.b1).toBe("bb");
  expect(rBA.a1).toBe(0);
});
