import { Decoder, Encoder, EvDecoder, NNI, toHex } from "@ndn/tlv";

import { Name, NameLike, TT } from "./mod";

const EVD = new EvDecoder<FwHint.Delegation>("Delegation", TT.Delegation)
.add(TT.Name, (t, { decoder }) => t.name = decoder.decode(Name))
.add(TT.Preference, (t, { nni }) => t.preference = nni);

export class FwHint {
  public static decodeValue(value: Uint8Array): FwHint {
    const dels = [] as FwHint.Delegation[];
    for (const decoder = new Decoder(value); !decoder.eof;) {
      dels.push(decoder.decode(FwHint.Delegation));
    }
    return new FwHint(dels);
  }

  constructor(copy?: FwHint);

  constructor(delegations: ReadonlyArray<FwHint.Delegation>);

  constructor(arg?: FwHint|ReadonlyArray<FwHint.Delegation>) {
    if (Array.isArray(arg)) {
      for (const del of arg) {
        this.m.set(toHex(del.name.value), del);
      }
    } else if (arg instanceof FwHint) {
      this.m = new Map(arg.m);
    }
  }

  public get delegations(): ReadonlyArray<FwHint.Delegation> {
    return Array.from(this.m.values()).sort((a, b) => a.preference - b.preference);
  }

  private m = new Map<string, FwHint.Delegation>();

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.ForwardingHint, Encoder.OmitEmpty, ...this.delegations);
  }
}

export namespace FwHint {
  export class Delegation {
    public static decodeFrom(decoder: Decoder): Delegation {
      return EVD.decode(new Delegation(), decoder);
    }

    constructor(name: NameLike = "", public preference = 0) {
      this.name = new Name(name);
    }

    public name: Name;

    public encodeTo(encoder: Encoder) {
      encoder.prependTlv(TT.Delegation,
        this.name,
        [TT.Preference, NNI(this.preference)],
      );
    }
  }
}
