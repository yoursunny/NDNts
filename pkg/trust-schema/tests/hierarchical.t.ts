import "@ndn/packet/test-fixture/expect";

import { Forwarder } from "@ndn/fw";
import { Certificate, ECDSA, generateSigningKey, KeyChain, type NamedSigner, type NamedVerifier, RSA, SigningAlgorithmListFull } from "@ndn/keychain";
import { Component, Data, digestSigning, type NameLike, type Signer, ValidityPeriod, type Verifier } from "@ndn/packet";
import { PrefixRegShorter } from "@ndn/repo";
import { makeRepoProducer } from "@ndn/repo/test-fixture/producer";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import { HierarchicalSigner, HierarchicalVerifier, pattern as P, TrustSchema, TrustSchemaPolicy, TrustSchemaSigner, TrustSchemaVerifier } from "..";

afterAll(Forwarder.deleteDefault);

interface IContext extends Context {}

class Context {
  public keyChain = KeyChain.createTemp(SigningAlgorithmListFull);
  public name0: NameLike = "/root";
  public opts0: Partial<Certificate.SelfSignOptions> = {};
  public pvt0!: NamedSigner.PrivateKey;
  public pub0!: NamedVerifier.PublicKey;
  public cert0!: Certificate;
  public name1: NameLike = "/root/site";
  public opts1: Partial<Certificate.IssueOptions> = {};
  public pvt1!: NamedSigner.PrivateKey;
  public pub1!: NamedVerifier.PublicKey;
  public cert1!: Certificate;
  public name2: NameLike = "/root/site/group/user";
  public opts2: Partial<Certificate.IssueOptions> = {};
  public pvt2!: NamedSigner.PrivateKey;
  public pub2!: NamedVerifier.PublicKey;
  public cert2!: Certificate;
  public dataName: NameLike = "/root/site/group/user/path/data";
  public data!: Signer.Signable & Verifier.Verifiable;

  public static async create(opts: Partial<IContext>, ctor: new() => Context = Context): Promise<Context> {
    const ctx = new ctor();
    Object.assign(ctx, opts);
    await ctx.makeCert0();
    await ctx.makeCert1();
    await ctx.makeCert2();
    await ctx.makeData();
    return ctx;
  }

  public async testSigner({
    makeSigner,
    signerMustLpm = true,
  }: Row, f: (signer: Signer, data: Signer.Signable) => Promise<void>) {
    const signer = makeSigner(this);
    const data = new Data(this.dataName, Uint8Array.of(0xD0, 0xD1));
    await f(signer, data);
  }

  public async testVerifier({
    makeVerifier,
    enableProducer = true,
  }: Row, f: (verifier: Verifier, data: Verifier.Verifiable) => Promise<void>) {
    const certProducer = enableProducer ?
      await makeRepoProducer({ reg: PrefixRegShorter(4) }, [this.cert1.data, this.cert2.data]) :
      undefined;
    const verifier = makeVerifier(this);
    try {
      await f(verifier, this.data);
    } finally {
      certProducer?.close();
    }
  }

  protected async makeCert0() {
    [this.pvt0, this.pub0] = await generateSigningKey(this.name0, ECDSA, { curve: "P-384" });
    this.cert0 = await Certificate.selfSign({
      privateKey: this.pvt0,
      publicKey: this.pub0,
      ...this.opts0,
    });
  }

  protected async makeCert1() {
    [this.pvt1, this.pub1] = await generateSigningKey(this.keyChain, this.name1, RSA);
    this.cert1 = await Certificate.issue({
      publicKey: this.pub1,
      issuerPrivateKey: this.pvt0,
      validity: ValidityPeriod.daysFromNow(2),
      issuerId: Component.from("H"),
      ...this.opts1,
    });
    await this.keyChain.insertCert(this.cert1);
  }

  protected async makeCert2() {
    [this.pvt2, this.pub2] = await generateSigningKey(this.keyChain, this.name2, ECDSA);
    this.cert2 = await Certificate.issue({
      publicKey: this.pub2,
      issuerPrivateKey: this.pvt1,
      validity: ValidityPeriod.daysFromNow(1),
      issuerId: Component.from("H"),
      ...this.opts2,
    });
    await this.keyChain.insertCert(this.cert2);
  }

  protected async makeData() {
    this.data = new Data(this.dataName, Uint8Array.of(0xC0, 0xC1));
    await this.pvt2.sign(this.data);
  }
}

const hPolicy = new TrustSchemaPolicy();
hPolicy.addPattern("packet", new P.ConcatPattern([
  new P.VariablePattern("prefix", { minComps: 0, maxComps: Infinity }),
  new P.VariablePattern("suffix", { minComps: 0, maxComps: Infinity }),
]));
hPolicy.addPattern("signer", new P.ConcatPattern([
  new P.VariablePattern("prefix", { minComps: 0, maxComps: Infinity }),
  new P.CertNamePattern(),
]));
hPolicy.addRule("packet", "signer");

interface Row {
  summary: string;
  makeSigner: (ctx: IContext) => Signer;
  signerMustLpm?: boolean;
  makeVerifier: (ctx: IContext) => Verifier;
  enableProducer?: boolean;
}

const TABLE: Row[] = [
  {
    summary: "HierarchicalVerifier online",
    makeSigner(ctx: IContext) {
      return new HierarchicalSigner(ctx.keyChain);
    },
    makeVerifier(ctx: IContext) {
      return new HierarchicalVerifier({
        trustAnchors: [ctx.cert0],
        interestLifetime: 100,
        algoList: SigningAlgorithmListFull,
      });
    },
  },
  {
    summary: "HierarchicalVerifier offline",
    makeSigner(ctx: IContext) {
      return new HierarchicalSigner(ctx.keyChain);
    },
    makeVerifier(ctx: IContext) {
      return new HierarchicalVerifier({
        trustAnchors: [ctx.cert0],
        offline: true,
        keyChain: ctx.keyChain,
        algoList: SigningAlgorithmListFull,
      });
    },
    enableProducer: false,
  },
  {
    summary: "TrustSchemaVerifier with hierarchical policy",
    makeSigner(ctx: IContext) {
      return new TrustSchemaSigner({
        keyChain: ctx.keyChain,
        schema: new TrustSchema(hPolicy, [ctx.cert0]),
      });
    },
    signerMustLpm: false,
    makeVerifier(ctx: IContext) {
      return new TrustSchemaVerifier({
        schema: new TrustSchema(hPolicy, [ctx.cert0]),
        interestLifetime: 100,
        algoList: SigningAlgorithmListFull,
      });
    },
  },
];

describe("success", () => {
  let ctx: Context;
  beforeAll(async () => { ctx = await Context.create({}); });
  test.each(TABLE)("$summary", async (row) => {
    await ctx.testSigner(row, async (signer, data) => {
      await signer.sign(data);
      if (row.signerMustLpm ?? true) {
        expect(data.sigInfo?.keyLocator).toHaveName(ctx.cert2.name);
      }
    });
    await ctx.testVerifier(row, async (verifier, data) => {
      await verifier.verify(data);
      await verifier.verify(data); // should use cryptoVerifyCache
    });
  });
});

describe("success same name", () => {
  let ctx: Context;
  beforeAll(async () => {
    ctx = await Context.create({
      name1: "/root/site/group",
      name2: "/root/site/group",
    });
  });
  test.each(TABLE)("$summary", async (row) => {
    await ctx.testVerifier(row, async (verifier, data) => {
      await verifier.verify(data);
    });
  });
});

describe("data non-hierarchical", () => {
  let ctx: Context;
  beforeAll(async () => {
    ctx = await Context.create({
      dataName: "/data",
    });
  });
  test.each(TABLE)("$summary", async (row) => {
    await ctx.testSigner(row, async (signer, data) => {
      await expect(signer.sign(data)).rejects.toThrow();
    });
    await ctx.testVerifier(row, async (verifier, data) => {
      await expect(verifier.verify(data)).rejects.toThrow();
    });
  });
});

describe("cert non-hierarchical", () => {
  let ctx: Context;
  beforeAll(async () => {
    ctx = await Context.create({
      name1: "/root/other-site",
    });
  });
  test.each(TABLE)("$summary", async (row) => {
    await ctx.testVerifier(row, async (verifier, data) => {
      await expect(verifier.verify(data)).rejects.toThrow();
    });
  });
});

describe("bad signature", () => {
  let fakePvt1: NamedSigner.PrivateKey;
  let ctx: Context;
  beforeAll(async () => {
    [fakePvt1] = await generateSigningKey("/root/site", RSA);
    ctx = await Context.create({
      name1: fakePvt1.name,
      opts2: {
        issuerPrivateKey: fakePvt1,
      },
    });
  });
  test.each(TABLE)("$summary", async (row) => {
    await ctx.testVerifier(row, async (verifier, data) => {
      await expect(verifier.verify(data)).rejects.toThrow(/bad/);
    });
  });
});

describe("root expired", () => {
  let ctx: Context;
  beforeAll(async () => {
    const now = Date.now();
    ctx = await Context.create({
      opts0: {
        validity: new ValidityPeriod(now - 5 * 86400000, now - 2 * 86400000),
      },
    });
  });
  test.each(TABLE)("$summary", async (row) => {
    await ctx.testVerifier(row, async (verifier, data) => {
      await expect(verifier.verify(data)).rejects.toThrow(/expired/);
    });
  });
});

describe("cert expired", () => {
  let ctx: Context;
  beforeAll(async () => {
    const now = Date.now();
    ctx = await Context.create({
      opts2: {
        validity: new ValidityPeriod(now - 5 * 86400000, now - 2 * 86400000),
      },
    });
  });
  test.each(TABLE)("$summary", async (row) => {
    await ctx.testVerifier(row, async (verifier, data) => {
      await expect(verifier.verify(data)).rejects.toThrow(/expired/);
    });
  });
});

describe("no KeyLocator", () => {
  let ctx: Context;
  beforeAll(async () => {
    ctx = await Context.create({}, class extends Context {
      override async makeData() {
        await super.makeData();
        await digestSigning.sign(this.data);
      }
    });
  });
  test.each(TABLE)("$summary", async (row) => {
    await ctx.testVerifier(row, async (verifier, data) => {
      await expect(verifier.verify(data)).rejects.toThrow(/KeyLocator/);
    });
  });
});
