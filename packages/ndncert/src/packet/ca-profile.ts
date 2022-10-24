import { type NamedVerifier, type SigningAlgorithm, Certificate, createVerifier, SigningAlgorithmListSlim } from "@ndn/keychain";
import { Segment, Version } from "@ndn/naming-convention2";
import { type Signer, Data, Name } from "@ndn/packet";
import { type EncodableTlv, Encoder, EvDecoder, NNI } from "@ndn/tlv";
import { toHex, toUtf8 } from "@ndn/util";

import { C, TT } from "./an";
import * as decode_common from "./decode-common";

const EVD = new EvDecoder<CaProfile.Fields>("CaProfile")
  .add(TT.CaPrefix, (t, { vd }) => t.prefix = vd.decode(Name), { required: true })
  .add(TT.CaInfo, (t, { text }) => t.info = text, { required: true })
  .add(TT.ParameterKey, (t, { text }) => t.probeKeys.push(text), { repeat: true })
  .add(TT.MaxValidityPeriod, (t, { nni }) => t.maxValidityPeriod = nni * 1000, { required: true })
  .add(TT.CaCertificate, (t, { vd }) => t.cert = Certificate.fromData(vd.decode(Data)), { required: true });
EVD.beforeObservers.push((t) => t.probeKeys = []);

/** CA profile packet. */
export class CaProfile {
  /**
   * Decode CA profile from Data packet.
   * @param algoList list of recognized algorithms for CA certificate.
   */
  public static fromData(data: Data, algoList = SigningAlgorithmListSlim): Promise<CaProfile> {
    return decode_common.fromData(data, EVD, async (f) => {
      decode_common.checkName(data, f, C.INFO, Version, Segment);
      const publicKey = await createVerifier(f.cert, { algoList });
      await publicKey.verify(data);
      const certDigest = await f.cert.data.computeImplicitDigest();
      return new CaProfile(data, publicKey, certDigest);
    });
  }

  private constructor(
      public readonly data: Data,
      public readonly publicKey: NamedVerifier.PublicKey,
      public readonly certDigest: Uint8Array,
  ) {}

  public toString() {
    return `NDNCERT 0.3 CA profile
CA prefix: ${this.prefix}
CA information:
${this.info.trim().replace(/^/gm, "  ")}
PROBE keys:
${this.probeKeys.length === 0 ? "  (none)" : this.probeKeys.map((key) => `  ${key}`).join("\n")}
Maximum validity period: ${this.maxValidityPeriod / 86400000} days
Certificate name: ${this.cert.data.name}
Certificate digest: ${toHex(this.certDigest)}`;
  }

  public toJSON(): CaProfile.ToJSON {
    return {
      prefix: this.prefix.toString(),
      info: this.info,
      probeKeys: this.probeKeys,
      maxValidityPeriod: this.maxValidityPeriod,
      certName: this.cert.data.name.toString(),
      certDigest: toHex(this.certDigest),
    };
  }
}
export interface CaProfile extends Readonly<CaProfile.Fields> {}

export namespace CaProfile {
  export interface ToJSON {
    prefix: string;
    info: string;
    probeKeys: string[];
    maxValidityPeriod: number;
    certName: string;
    certDigest: string;
  }

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
    algoList?: readonly SigningAlgorithm[];
  };

  export async function build({
    prefix,
    info,
    probeKeys,
    maxValidityPeriod,
    cert,
    signer,
    version = Date.now(),
    algoList = SigningAlgorithmListSlim,
  }: Options): Promise<CaProfile> {
    const payload = Encoder.encode([
      [TT.CaPrefix, prefix],
      [TT.CaInfo, toUtf8(info)],
      ...probeKeys.map((key): EncodableTlv => [TT.ParameterKey, toUtf8(key)]),
      [TT.MaxValidityPeriod, NNI(maxValidityPeriod / 1000)],
      [TT.CaCertificate, cert.data],
    ]);

    const data = new Data();
    data.name = prefix.append(C.CA, C.INFO, Version.create(version), Segment.create(0));
    data.freshnessPeriod = 3600000;
    data.content = payload;
    data.isFinalBlock = true;
    await signer.sign(data);
    return CaProfile.fromData(data, algoList);
  }
}
