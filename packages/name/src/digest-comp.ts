import { TT } from "./an";
import { Component } from "./component";
import { NamingConvention } from "./convention";

const DIGEST_LENGTH = 32;

class DigestComp implements NamingConvention<Uint8Array> {
  constructor(private tt: number) {
  }

  public match(comp: Component): boolean {
    return comp.type === this.tt && comp.length === DIGEST_LENGTH;
  }

  public create(v: Uint8Array): Component {
    if (v.length !== DIGEST_LENGTH) {
      throw new Error("digest length must be " + DIGEST_LENGTH);
    }
    return new Component(this.tt, v);
  }

  public parse(comp: Component): Uint8Array {
    return comp.value;
  }
}

/** ImplicitSha256DigestComponent */
export const ImplicitDigest = new DigestComp(TT.ImplicitSha256DigestComponent);

/** ParametersSha256DigestComponent */
export const ParamsDigest = new DigestComp(TT.ParametersSha256DigestComponent);
