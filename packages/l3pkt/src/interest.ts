import { Name, NameLike, ParamsDigest } from "@ndn/name";
import { Decoder, Encoder, EvDecoder, NNI } from "@ndn/tlv";

import { TT } from "./an";
import { LLSign, LLVerify } from "./llsign";
import { sha256 } from "./sha256";
import { ISigInfo } from "./sig-info";

const LIFETIME_DEFAULT = 4000;
const HOPLIMIT_MAX = 255;
const DecodeParams = Symbol("Interest.DecodeParams");
const DigestValidated = Symbol("Interest.DigestValidated");

const EVD = new EvDecoder<Interest>("Interest", TT.Interest)
.add(TT.Name, (self, { decoder }) => self.name = decoder.decode(Name))
.add(TT.CanBePrefix, (self) => self.canBePrefix = true)
.add(TT.MustBeFresh, (self) => self.mustBeFresh = true)
// TODO ForwardingHint
.add(TT.Nonce, (self, { value }) => self.nonce = NNI.decode(value, 4))
.add(TT.InterestLifetime, (self, { value }) => self.lifetime = NNI.decode(value))
.add(TT.HopLimit, (self, { value }) => self.hopLimit = NNI.decode(value, 1))
.add(TT.AppParameters, (self, { value, tlv, after }) => {
  if (ParamsDigest.findIn(self.name, false) < 0) {
    throw new Error("ParamsDigest missing in parameterized Interest");
  }
  self.appParameters = value;
  self[DecodeParams] = new Uint8Array(tlv.buffer, tlv.byteOffset,
                                              tlv.byteLength + after.byteLength);
})
.add(TT.ISigInfo, (self, { decoder }) => self.sigInfo = decoder.decode(ISigInfo))
.add(TT.ISigValue, (self, { value, tlv }) => {
  if (!ParamsDigest.match(self.name.at(-1))) {
    throw new Error("ParamsDigest missing or out of place in signed Interest");
  }

  const params = self[DecodeParams];
  if (!(params instanceof Uint8Array)) {
    throw new Error("AppParameters missing in signed Interest");
  }

  if (typeof self.sigInfo === "undefined") {
    throw new Error("ISigInfo missing in signed Interest");
  }

  self.sigValue = value;
  self[LLVerify.SIGNED] = Encoder.encode([
    self.name.getPrefix(-1).valueOnly,
    new Uint8Array(tlv.buffer, params.byteOffset, tlv.byteOffset - params.byteOffset),
  ]);
});

/** Interest packet. */
export class Interest {
  public get nonce() { return this.nonce_; }
  public set nonce(v) { this.nonce_ = v && NNI.constrain(v, "Nonce", 0xFFFFFFFF); }

  public get lifetime() { return this.lifetime_; }
  public set lifetime(v) { this.lifetime_ = NNI.constrain(v, "InterestLifetime"); }

  public get hopLimit() { return this.hopLimit_; }
  public set hopLimit(v) { this.hopLimit_ = NNI.constrain(v, "HopLimit", HOPLIMIT_MAX); }

  public static decodeFrom(decoder: Decoder): Interest {
    return EVD.decode(new Interest(), decoder);
  }

  public name: Name = new Name();
  public canBePrefix: boolean = false;
  public mustBeFresh: boolean = false;
  public appParameters?: Uint8Array;
  public sigInfo?: ISigInfo;
  public sigValue?: Uint8Array;
  public [LLSign.PENDING]?: LLSign;
  public [LLVerify.SIGNED]?: Uint8Array;

  /**
   * Portion covered by ParamsDigest.
   * This is set to Uint8Array during decoding, when AppParameters is present.
   * 'DigestValidated' indicates ParamsDigest has been validated.
   */
  public [DecodeParams]?: Uint8Array|typeof DigestValidated;

  private nonce_: number|undefined;
  private lifetime_: number = LIFETIME_DEFAULT;
  private hopLimit_: number = HOPLIMIT_MAX;

  /**
   * Construct from flexible arguments.
   *
   * Arguments can include, in any order:
   * - Interest to copy from
   * - Name or name URI
   * - Interest.CanBePrefix
   * - Interest.MustBeFresh
   * - Interest.Nonce(v)
   * - Interest.Lifetime(v)
   * - Interest.HopLimit(v)
   * - Uint8Array as AppParameters
   */
  constructor(...args: Array<Interest | Interest.CtorArg>) {
    args.forEach((arg) => {
      if (Name.isNameLike(arg)) {
        this.name = new Name(arg);
      } else if (arg === Interest.CanBePrefix) {
        this.canBePrefix = true;
      } else if (arg === Interest.MustBeFresh) {
        this.mustBeFresh = true;
      } else if (arg instanceof NonceTag) {
        this.nonce = arg.v;
      } else if (arg instanceof LifetimeTag) {
        this.lifetime = arg.v;
      } else if (arg instanceof HopLimitTag) {
        this.hopLimit = arg.v;
      } else if (arg instanceof Uint8Array) {
        this.appParameters = arg;
      } else if (arg instanceof Interest) {
        Object.assign(this, arg);
      } else {
        throw new Error("unknown Interest constructor argument");
      }
    });
  }

  public encodeTo(encoder: Encoder) {
    this.insertParamsDigest();
    LLSign.encodeErrorIfPending(this);

    const nonce = typeof this.nonce === "undefined" ?
                  Math.random() * 0x100000000 : this.nonce;

    encoder.prependTlv(TT.Interest,
      this.name,
      this.canBePrefix ? [TT.CanBePrefix] : undefined,
      this.mustBeFresh ? [TT.MustBeFresh] : undefined,
      [TT.Nonce, NNI(nonce, 4)],
      this.lifetime !== LIFETIME_DEFAULT ?
        [TT.InterestLifetime, NNI(this.lifetime)] : undefined,
      this.hopLimit !== HOPLIMIT_MAX ?
        [TT.HopLimit, NNI(this.hopLimit, 1)] : undefined,
      this.appParameters ?
        [TT.AppParameters, this.appParameters] : undefined,
      this.sigInfo,
      this.sigValue ?
        [TT.ISigValue, this.sigValue] : undefined,
    );
  }

  public async updateParamsDigest(): Promise<void> {
    let pdIndex = ParamsDigest.findIn(this.name);
    if (pdIndex < 0) {
      pdIndex = this.appendParamsDigestPlaceholder();
    }

    const params = Encoder.encode([
      [TT.AppParameters, this.appParameters],
      this.sigInfo,
      [TT.ISigValue, Encoder.OmitEmpty, this.sigValue],
    ]);
    const d = await sha256(params);
    this.name = this.name.replaceAt(pdIndex, ParamsDigest.create(d));
  }

  public [LLSign.PROCESS](): Promise<void> {
    this.insertParamsDigest();
    return LLSign.processImpl(this,
      () => Encoder.encode([
        this.name.getPrefix(-1).valueOnly,
        [TT.AppParameters, this.appParameters],
        this.sigInfo,
      ]),
      (sig) => {
        this.sigValue = this.sigInfo ? sig : undefined;
        return this.updateParamsDigest();
      });
  }

  public async validateParamsDigest(): Promise<void> {
    if (typeof this.appParameters === "undefined") {
      return;
    }

    const params = this[DecodeParams];
    if (params === DigestValidated) {
      return;
    }
    if (typeof params === "undefined") {
      throw new Error("parameters portion is empty");
    }

    const pdComp = this.name.at(ParamsDigest.findIn(this.name, false));
    const d = await sha256(params);
    // This is not a constant-time comparison. It's for integrity purpose only.
    if (!pdComp.equals(ParamsDigest.create(d))) {
      throw new Error("incorrect ParamsDigest");
    }
    this[DecodeParams] = DigestValidated;
  }

  public async [LLVerify.VERIFY](verify: LLVerify): Promise<void> {
    await this.validateParamsDigest();
    if (!this.sigValue) {
      return;
    }
    await LLVerify.verifyImpl(this, this.sigValue, verify);
  }

  private insertParamsDigest() {
    if (this.name.size < 1) {
      throw new Error("Interest name is empty");
    }

    const pdIndex = ParamsDigest.findIn(this.name);
    if (this.sigInfo) {
      if (pdIndex >= 0 && pdIndex !== this.name.size - 1) {
        throw new Error("ParamsDigest out of place for signed Interest");
      }
    }
    if (this.sigInfo || pdIndex >= 0) {
      this.appParameters = this.appParameters || new Uint8Array();
    }
    if (!this.appParameters) {
      return; // not a parameterized or signed Interest
    }

    if (pdIndex < 0) {
      this.appendParamsDigestPlaceholder();
    }
    if ((pdIndex < 0 || ParamsDigest.isPlaceholder(this.name.at(pdIndex))) && !this[LLSign.PENDING]) {
      // insert noop signing operation to trigger digest update
      this[LLSign.PENDING] = () => Promise.resolve(new Uint8Array());
    }
  }

  private appendParamsDigestPlaceholder(): number {
    this.name = this.name.append(ParamsDigest.PLACEHOLDER);
    return this.name.size - 1;
  }
}

class NonceTag {
  constructor(public v: number) {
  }
}

class LifetimeTag {
  constructor(public v: number) {
  }
}

class HopLimitTag {
  constructor(public v: number) {
  }
}

export namespace Interest {
  export const CanBePrefix = Symbol("CanBePrefix");
  export const MustBeFresh = Symbol("MustBeFresh");

  export function Nonce(v: number): NonceTag {
    return new NonceTag(v);
  }

  export function Lifetime(v: number): LifetimeTag {
    return new LifetimeTag(v);
  }

  export function HopLimit(v: number): HopLimitTag {
    return new HopLimitTag(v);
  }

  export type CtorArg = NameLike | typeof CanBePrefix | typeof MustBeFresh |
                        LifetimeTag | HopLimitTag | Uint8Array;
}
