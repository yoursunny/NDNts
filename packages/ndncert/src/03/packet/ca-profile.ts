import { Certificate, PrivateKey, PublicKey } from "@ndn/keychain";
import { Segment, Version } from "@ndn/naming-convention2";
import { Data, Name } from "@ndn/packet";
import { Decoder, EncodableTlv, Encoder, EvDecoder, NNI, toUtf8 } from "@ndn/tlv";

import { TT, Verb } from "./an";

const EVD = new EvDecoder<CaProfile.Fields>("CaProfile", undefined)
  .add(TT.CaPrefix, (t, { vd }) => t.prefix = vd.decode(Name), { required: true })
  .add(TT.CaInfo, (t, { text }) => t.info = text, { required: true })
  .add(TT.ParameterKey, (t, { text }) => t.probeKeys.push(text), { repeat: true })
  .add(TT.MaxValidityPeriod, (t, { nni }) => t.maxValidityPeriod = nni, { required: true })
  .add(TT.CaCertificate, (t, { vd }) => t.cert = new Certificate(vd.decode(Data)), { required: true });

export class CaProfile {
  public static async fromData(data: Data): Promise<CaProfile> {
    const profile = new CaProfile(data);
    if (!(data.name.getPrefix(-3).equals(profile.prefix) &&
          data.name.at(-3).equals(Verb.INFO) &&
          data.name.at(-2).is(Version) &&
          data.name.at(-1).is(Segment))) {
      throw new Error("bad Name");
    }
    profile.publicKey_ = await Certificate.loadPublicKey(profile.cert);
    await profile.publicKey.verify(data);
    return profile;
  }

  private constructor(public readonly data: Data) {
    (this as CaProfile.Fields).probeKeys = [];
    EVD.decodeValue(this, new Decoder(data.content));
  }

  private publicKey_!: PublicKey;
  public get publicKey() { return this.publicKey_; }
}
export interface CaProfile extends Readonly<CaProfile.Fields> {}

export namespace CaProfile {
  export interface Fields {
    prefix: Name;
    info: string;
    probeKeys: string[];
    maxValidityPeriod: number; // seconds
    cert: Certificate;
  }

  export type Options = Fields & {
    signer: PrivateKey;
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
      [TT.MaxValidityPeriod, NNI(maxValidityPeriod)],
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
