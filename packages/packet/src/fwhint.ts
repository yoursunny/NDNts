import { type Decoder, Encoder, EvDecoder } from "@ndn/tlv";

import { TT } from "./an";
import { type NameLike, Name } from "./name/mod";

const EVD = new EvDecoder<Name[]>("FwHint")
  .add(TT.Name, (t, { decoder }) => t.push(decoder.decode(Name)), { repeat: true });

/** ForwardingHint in Interest. */
export class FwHint {
  public static decodeValue(vd: Decoder): FwHint {
    const t = new FwHint();
    EVD.decodeValue(t.delegations, vd);
    return t;
  }

  constructor(copy?: FwHint);

  constructor(name: NameLike);

  constructor(delegations: readonly NameLike[]);

  constructor(arg?: FwHint | NameLike | readonly NameLike[]) {
    if (Array.isArray(arg)) {
      for (const name of arg) {
        this.delegations.push(Name.from(name));
      }
    } else if (arg instanceof FwHint) {
      this.delegations = [...arg.delegations];
    } else if (Name.isNameLike(arg)) {
      this.delegations = [Name.from(arg)];
    }
  }

  public delegations: Name[] = [];

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.ForwardingHint, Encoder.OmitEmpty, ...this.delegations);
  }
}
