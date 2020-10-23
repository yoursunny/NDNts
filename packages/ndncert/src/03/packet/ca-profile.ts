import { Certificate, NamedVerifier } from "@ndn/keychain";
import { Segment, Version } from "@ndn/naming-convention2";
import { Data, Name, Signer } from "@ndn/packet";
import { Decoder, EncodableTlv, Encoder, EvDecoder, NNI, toHex, toUtf8 } from "@ndn/tlv";
import indentString from "indent-string";

import { TT, Verb } from "./an";

const EVD = new EvDecoder<CaProfile.Fields>("CaProfile", undefined)
  .add(TT.CaPrefix, (t, { vd }) => t.prefix = vd.decode(Name), { required: true })
  .add(TT.CaInfo, (t, { text }) => t.info = text, { required: true })
  .add(TT.ParameterKey, (t, { text }) => t.probeKeys.push(text), { repeat: true })
  .add(TT.MaxValidityPeriod, (t, { nni }) => t.maxValidityPeriod = nni * 1000, { required: true })
  .add(TT.CaCertificate, (t, { vd }) => t.cert = Certificate.fromData(vd.decode(Data)), { required: true });

/** CA profile packet. */
export class CaProfile {
  public static async fromData(data: Data): Promise<CaProfile> {
    const profile = new CaProfile(data);
    if (!(data.name.getPrefix(-3).equals(profile.prefix) &&
          data.name.at(-3).equals(Verb.INFO) &&
          data.name.at(-2).is(Version) &&
          data.name.at(-1).is(Segment))) {
      throw new Error("bad Name");
    }
    profile.publicKey_ = await profile.cert.createVerifier();
    await profile.publicKey.verify(data);
    profile.certDigest_ = await profile.cert.data.computeImplicitDigest();
    return profile;
  }

  private constructor(public readonly data: Data) {
    (this as CaProfile.Fields).probeKeys = [];
    EVD.decodeValue(this, new Decoder(data.content));
  }

  private publicKey_!: NamedVerifier.PublicKey;
  public get publicKey() { return this.publicKey_; }

  private certDigest_!: Uint8Array;
  public get certDigest() { return this.certDigest_; }

  public toString() {
    return `NDNCERT 0.3 CA profile
CA prefix: ${this.prefix}
CA information:
${indentString(this.info, 2)}
PROBE keys:
${this.probeKeys.length === 0 ? "  (none)" : this.probeKeys.map((key) => `  ${key}`).join("\n")}
Maximum validity period: ${this.maxValidityPeriod / 86400000} days
Certificate name: ${this.cert.data.name}
Certificate digest: ${toHex(this.certDigest)}`;
  }
}
export interface CaProfile extends Readonly<CaProfile.Fields> {}

export namespace CaProfile {
  export interface Fields {
    prefix: Name;
    info: string;
    probeKeys: string[];
    maxValidityPeriod: number; // milliseconds
    cert: Certificate;
  }

  export type Options = Fields & {
    signer: Signer;
    version?: number;
  };

  export async function build({
    prefix,
    info,
    probeKeys,
    maxValidityPeriod,
    cert,
    signer,
    version = Date.now(),
  }: Options): Promise<CaProfile> {
    const payload = Encoder.encode([
      [TT.CaPrefix, prefix],
      [TT.CaInfo, toUtf8(info)],
      ...probeKeys.map((key): EncodableTlv => [TT.ParameterKey, toUtf8(key)]),
      [TT.MaxValidityPeriod, NNI(maxValidityPeriod / 1000)],
      [TT.CaCertificate, cert.data],
    ]);

    const data = new Data();
    data.name = prefix.append(Verb.INFO).append(Version, version).append(Segment, 0);
    data.freshnessPeriod = 3600000;
    data.content = payload;
    await signer.sign(data);
    return CaProfile.fromData(data);
  }
}
