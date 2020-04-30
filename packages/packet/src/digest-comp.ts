import { toHex } from "@ndn/tlv";

import { TT } from "./an";
import { Component } from "./component";
import { NamingConvention } from "./convention";
import { Name } from "./name";

const DIGEST_LENGTH = 32;

class DigestComp implements NamingConvention<Uint8Array>, NamingConvention.WithAltUri {
  constructor(private readonly tt: number, private readonly altUriPrefix: string) {
  }

  public match(comp: Component): boolean {
    return comp.type === this.tt && comp.length === DIGEST_LENGTH;
  }

  public create(v: Uint8Array): Component {
    if (v.length !== DIGEST_LENGTH) {
      throw new Error(`digest length must be ${DIGEST_LENGTH}`);
    }
    return new Component(this.tt, v);
  }

  public parse(comp: Component): Uint8Array {
    return comp.value;
  }

  public toAltUri(comp: Component): string {
    return `${this.altUriPrefix}=${toHex(comp.value).toLowerCase()}`;
  }
}

class ImplicitDigestComp extends DigestComp {
  constructor() {
    super(TT.ImplicitSha256DigestComponent, "sha256digest");
  }

  /** Remove ImplicitDigest if present at last component. */
  public strip(name: Name): Name {
    const lastComp = name.get(-1);
    if (!!lastComp && this.match(lastComp)) {
      return name.getPrefix(-1);
    }
    return name;
  }
}

/** ImplicitSha256DigestComponent */
export const ImplicitDigest = new ImplicitDigestComp();

const PARAMS_PLACEHOLDER_TAG = Symbol("ParametersSha256DigestComponent.placeholder");

class ParamsDigestComp extends DigestComp {
  /** ParamsDigest placeholder during Interest encoding. */
  public readonly PLACEHOLDER: Component;

  constructor() {
    super(TT.ParametersSha256DigestComponent, "params-sha256");
    this.PLACEHOLDER = Object.assign(
      new Component(TT.ParametersSha256DigestComponent),
      { [PARAMS_PLACEHOLDER_TAG]: true });
  }

  /** Determine if comp is a ParamsDigest placeholder. */
  public isPlaceholder(comp: Component): boolean {
    return !!(comp as any)[PARAMS_PLACEHOLDER_TAG];
  }

  /** Find ParamsDigest or placeholder in name. */
  public findIn(name: Name, matchPlaceholder = true): number {
    return name.comps.findIndex((comp) => this.match(comp) ||
                                (matchPlaceholder && this.isPlaceholder(comp)));
  }
}

/** ParametersSha256DigestComponent */
export const ParamsDigest = new ParamsDigestComp();
