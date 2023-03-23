import { CertNaming } from "@ndn/keychain";
import { Data, ImplicitDigest, Name, type Signer, TT as l3TT } from "@ndn/packet";
import { type EncodableTlv, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { TT } from "./an";
import type { CaProfile } from "./ca-profile";
import * as decode_common from "./decode-common";
import type { ProbeRequest } from "./probe-request";

const EntryEVD = new EvDecoder<ProbeResponse.Entry>("ProbeResponse.Entry", TT.ProbeResponse)
  .add(l3TT.Name, (t, { decoder }) => t.prefix = decoder.decode(Name), { required: true })
  .add(TT.MaxSuffixLength, (t, { nni }) => t.maxSuffixLength = nni);

const RedirectEVD = new EvDecoder<ProbeResponse.Redirect>("ProbeResponse.Redirect", TT.ProbeRedirect)
  .add(l3TT.Name,
    (t, { decoder }) => {
      t.caCertFullName = decoder.decode(Name);
      ProbeResponse.checkCaCertFullName(t.caCertFullName);
    },
    { required: true });

const EVD = new EvDecoder<ProbeResponse.Fields>("ProbeResponse")
  .add(TT.ProbeResponse,
    (t, { decoder }) => t.entries.push(EntryEVD.decode({} as ProbeResponse.Entry, decoder)),
    { repeat: true })
  .add(TT.ProbeRedirect,
    (t, { decoder }) => t.redirects.push(RedirectEVD.decode({} as ProbeResponse.Redirect, decoder)),
    { repeat: true });
EVD.beforeObservers.push((t) => {
  t.entries = [];
  t.redirects = [];
});
EVD.afterObservers.push(({ entries, redirects }) => {
  if (entries.length + redirects.length === 0) {
    throw new Error("at least one entry or redirect is required");
  }
});

/** PROBE response packet. */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ProbeResponse {
  public static async fromData(data: Data, profile: CaProfile): Promise<ProbeResponse> {
    await profile.publicKey.verify(data);
    return decode_common.fromData(data, EVD, () => new ProbeResponse(data));
  }

  private constructor(public readonly data: Data) {}
}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface ProbeResponse extends Readonly<ProbeResponse.Fields> {}

export namespace ProbeResponse {
  export interface Entry {
    prefix: Name;
    maxSuffixLength?: number;
  }

  export interface Redirect {
    caCertFullName: Name;
  }

  export interface Fields {
    entries: Entry[];
    redirects: Redirect[];
  }

  export type Options = Partial<Fields> & {
    profile: CaProfile;
    request: ProbeRequest;
    signer: Signer;
  };

  export async function build({
    profile,
    request: { interest: { name } },
    signer,
    entries = [],
    redirects = [],
  }: Options): Promise<ProbeResponse> {
    const payload = Encoder.encode([
      ...entries.map(({ prefix, maxSuffixLength }): EncodableTlv => [
        TT.ProbeResponse,
        prefix,
        maxSuffixLength ? [TT.MaxSuffixLength, NNI(maxSuffixLength)] : undefined,
      ]),
      ...redirects.map(({ caCertFullName }): EncodableTlv => [
        TT.ProbeRedirect,
        caCertFullName,
      ]),
    ]);

    const data = new Data();
    data.name = name;
    data.freshnessPeriod = 4000;
    data.content = payload;
    await signer.sign(data);
    return ProbeResponse.fromData(data, profile);
  }

  export function isCaCertFullName(name: Name): boolean {
    return name.at(-1).is(ImplicitDigest) && CertNaming.isCertName(name.getPrefix(-1));
  }

  export function checkCaCertFullName(name: Name): void {
    if (!isCaCertFullName(name)) {
      throw new Error("CA cert full name is invalid");
    }
  }
}
