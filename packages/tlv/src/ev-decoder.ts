import { assert } from "@ndn/util";

import type { Decoder } from "./decoder";
import { printTT } from "./string";

interface Rule<T> extends EvDecoder.RuleOptions {
  cb: EvDecoder.ElementDecoder<T>;
}

const AUTO_ORDER_SKIP = 100;

function nest<T>(evd: EvDecoder<T>): EvDecoder.ElementDecoder<T> {
  return (target, { decoder }) => { evd.decode(target, decoder); };
}

function isCritical(tt: number): boolean {
  return tt <= 0x1F || tt % 2 === 1;
}

/** TLV-VALUE decoder that understands Packet Format v0.3 evolvability guidelines. */
export class EvDecoder<T> {
  private readonly topTT: readonly number[];
  private readonly rules = new Map<number, Rule<T>>();
  private readonly requiredTT = new Set<number>();
  private nextOrder = AUTO_ORDER_SKIP;
  private isCritical: EvDecoder.IsCritical = isCritical;
  private unknownHandler?: EvDecoder.UnknownElementHandler<T>;

  /** Callbacks before decoding TLV-VALUE. */
  public readonly beforeObservers: Array<EvDecoder.TlvObserver<T>> = [];
  /** Callbacks after decoding TLV-VALUE. */
  public readonly afterObservers: Array<EvDecoder.TlvObserver<T>> = [];

  /**
   * Constructor.
   * @param typeName type name, used in error messages.
   * @param topTT if specified, check top-level TLV-TYPE to be in this list.
   */
  constructor(private readonly typeName: string, topTT: number | readonly number[] = []) {
    this.topTT = Array.isArray(topTT) ? (topTT as readonly number[]) : [topTT as number];
  }

  public applyDefaultsToRuleOptions({
    order = (this.nextOrder += AUTO_ORDER_SKIP),
    required = false,
    repeat = false,
  }: Partial<EvDecoder.RuleOptions> = {}): EvDecoder.RuleOptions {
    return { order, required, repeat };
  }

  /**
   * Add a decoding rule.
   * @param tt TLV-TYPE to match this rule.
   * @param cb callback or nested EvDecoder to handle element TLV.
   * @param opts additional rule options.
   */
  public add(tt: number, cb: EvDecoder.ElementDecoder<T> | EvDecoder<T>, opts: Partial<EvDecoder.RuleOptions> = {}): this {
    const ro = this.applyDefaultsToRuleOptions(opts);
    assert(!this.rules.has(tt), "duplicate rule for same TLV-TYPE");
    this.rules.set(tt, {
      ...ro,
      cb: cb instanceof EvDecoder ? nest(cb) : cb,
    });
    if (ro.required) {
      this.requiredTT.add(tt);
    }
    return this;
  }

  /** Set callback to determine whether TLV-TYPE is critical. */
  public setIsCritical(cb: EvDecoder.IsCritical): this {
    this.isCritical = cb;
    return this;
  }

  /** Set callback to handle unknown elements. */
  public setUnknown(cb: EvDecoder.UnknownElementHandler<T>): this {
    this.unknownHandler = cb;
    return this;
  }

  /** Decode TLV to target object. */
  public decode<R extends T = T>(target: R, decoder: Decoder): R {
    const topTlv = decoder.read();
    const { type, vd } = topTlv;
    if (this.topTT.length > 0 && !this.topTT.includes(type)) {
      throw new Error(`TLV-TYPE ${printTT(type)} is not ${this.typeName}`);
    }

    return this.decodeV(target, vd, topTlv);
  }

  /** Decode TLV-VALUE to target object. */
  public decodeValue<R extends T = T>(target: R, vd: Decoder): R {
    return this.decodeV(target, vd);
  }

  private decodeV<R extends T>(target: R, vd: Decoder, topTlv?: Decoder.Tlv): R {
    for (const cb of this.beforeObservers) {
      cb(target, topTlv);
    }

    let currentOrder = 0;
    const foundTT = new Set<number>();
    const missingTT = new Set(this.requiredTT);
    while (!vd.eof) {
      const tlv = vd.read();
      const tt = tlv.type;

      const rule = this.rules.get(tt);
      if (!rule) {
        if (!this.unknownHandler?.(target, tlv, currentOrder)) {
          this.handleUnrecognized(tt, "unknown");
        }
        continue;
      }

      if (currentOrder > rule.order) {
        this.handleUnrecognized(tt, "out of order");
        continue;
      }
      currentOrder = rule.order;

      if (!rule.repeat && foundTT.has(tt)) {
        throw new Error(`TLV-TYPE ${printTT(tt)} cannot repeat in ${this.typeName}`);
      }
      foundTT.add(tt);
      missingTT.delete(tt);

      rule.cb(target, tlv);
    }

    if (missingTT.size > 0) {
      throw new Error(`TLV-TYPE ${Array.from(missingTT, printTT).join(",")} missing in ${this.typeName}`);
    }

    for (const cb of this.afterObservers) {
      cb(target, topTlv);
    }
    return target;
  }

  private handleUnrecognized(tt: number, reason: string) {
    if (this.isCritical(tt)) {
      throw new Error(`TLV-TYPE ${printTT(tt)} is ${reason} in ${this.typeName}`);
    }
  }
}

export namespace EvDecoder {
  /** Invoked when a matching TLV element is found. */
  export type ElementDecoder<T> = (target: T, tlv: Decoder.Tlv) => void;

  export interface RuleOptions {
    /**
     * Expected order of appearance.
     * When using this option, it should be specified for all rules in a EvDecoder.
     * Default to the order in which rules were added to EvDecoder.
     */
    order: number;

    /**
     * Whether TLV element must appear at least once.
     * Default is false.
     */
    required: boolean;

    /**
     * Whether TLV element may appear more than once.
     * Default is false.
     */
    repeat: boolean;
  }

  /**
   * Invoked when a TLV element does not match any rule.
   * 'order' denotes the order number of last recognized TLV element.
   * Return true if this TLV element is accepted, or false to follow evolvability guidelines.
   */
  export type UnknownElementHandler<T> = (target: T, tlv: Decoder.Tlv, order: number) => boolean;

  /**
   * Function to determine whether a TLV-TYPE number is "critical".
   * Unrecognized or out-of-order TLV element with a critical TLV-TYPE number causes decoding error.
   */
  export type IsCritical = (tt: number) => boolean;

  /**
   * IsCritical callback that always returns false.
   * This means unrecognized or out-of-order TLV elements are ignored.
   */
  export const neverCritical: IsCritical = () => false;

  /**
   * Callback before or after decoding TLV-VALUE.
   * @param target target object.
   * @param topTlv top-level TLV element, available in EVD.decode but unavailable in EVD.decodeValue.
   */
  export type TlvObserver<T> = (target: T, topTlv?: Decoder.Tlv) => void;
}
