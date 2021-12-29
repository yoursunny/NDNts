import { Decoder, EncodableTlv, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { TT } from "./an";
import { Name, NameLike } from "./name/mod";

interface DelTLV {
  name: Name;
}

const DelEVD = new EvDecoder<DelTLV>("Delegation", TT.Delegation)
  .add(TT.Preference, () => undefined)
  .add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name), { required: true });

const DelsEVD = new EvDecoder<Name[]>("FwHint")
  .add(TT.Name, (t, { decoder }) => t.push(decoder.decode(Name)), { order: 1, repeat: true })
  .add(TT.Delegation, (t, { decoder }) => t.push(DelEVD.decode({} as DelTLV, decoder).name), { order: 1, repeat: true });

/** ForwardingHint in Interest. */
export class FwHint {
  public static decodeValue(vd: Decoder): FwHint {
    const t = new FwHint();
    DelsEVD.decodeValue(t.delegations, vd);
    return t;
  }

  constructor(copy?: FwHint);

  constructor(name: NameLike);

  constructor(delegations: readonly NameLike[]);

  constructor(arg?: FwHint | NameLike | readonly NameLike[]) {
    if (Array.isArray(arg)) {
      for (const name of arg) {
        this.delegations.push(new Name(name));
      }
    } else if (arg instanceof FwHint) {
      this.delegations = [...arg.delegations];
    } else if (Name.isNameLike(arg)) {
      this.delegations = [new Name(arg)];
    }
  }

  public delegations: Name[] = [];

  public encodeTo(encoder: Encoder) {
    switch (FwHint.encodeFormat) {
      case 2017:
        encoder.prependTlv(TT.ForwardingHint, Encoder.OmitEmpty,
          ...this.delegations.map((name, i): EncodableTlv => [TT.Delegation, [TT.Preference, NNI(i)], name]));
        break;
      case 2021:
        encoder.prependTlv(TT.ForwardingHint, Encoder.OmitEmpty, ...this.delegations);
        break;
    }
  }
}

export namespace FwHint {
  /**
   * ForwardingHint encoding format.
   * 2017: ForwardingHint = T L 1*Delegation, Delegation = T L Preference Name
   * 2021: ForwardingHint = T L 1*Name
   */
  export type EncodeFormat = 2017 | 2021;

  export let encodeFormat: FwHint.EncodeFormat = 2017;

  export function withEncodeFormat(format: EncodeFormat, cb: () => void): void {
    const prevFmt = encodeFormat;
    encodeFormat = format;
    try {
      cb();
    } finally {
      encodeFormat = prevFmt;
    }
  }
}
