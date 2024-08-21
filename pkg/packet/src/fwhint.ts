import { type Decoder, Encoder, EvDecoder } from "@ndn/tlv";
import type { Arrayable } from "type-fest";

import { TT } from "./an";
import { Name, type NameLike } from "./name/mod";

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

  constructor(delegations: Arrayable<NameLike>);

  constructor(arg?: FwHint | Arrayable<NameLike>) {
    if (Array.isArray(arg)) {
      for (const name of arg) {
        this.delegations.push(Name.from(name));
      }
    } else if (Name.isNameLike(arg)) {
      this.delegations = [Name.from(arg)];
    } else if (arg instanceof FwHint) {
      this.delegations = [...arg.delegations];
    }
  }

  public delegations: Name[] = [];

  public encodeTo(encoder: Encoder) {
    encoder.prependTlv(TT.ForwardingHint, Encoder.OmitEmpty, ...this.delegations);
  }
}
