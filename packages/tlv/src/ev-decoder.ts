import type { Decoder } from "./decoder";
import { printTT } from "./string";

interface Rule<T> extends EvDecoder.RuleOptions {
  cb: EvDecoder.ElementCallback<T>;
}

const AUTO_ORDER_SKIP = 100;

function nest<T>(evd: EvDecoder<T>): EvDecoder.ElementCallback<T> {
  return (target, { decoder }) => { evd.decode(target, decoder); };
}

function isCritical(tt: number): boolean {
  return tt <= 0x1F || tt % 2 === 1;
}

/** TLV-VALUE decoder that understands Packet Format v0.3 evolvability guidelines. */
export class EvDecoder<T> {
  private readonly topTT: readonly number[];
  private readonly rules = new Map<number, Rule<T>>();
  private readonly requiredTlvTypes = new Set<number>();
  private nextOrder = AUTO_ORDER_SKIP;
  private isCriticalCb: EvDecoder.IsCriticalCallback = isCritical;
  private unknownCb: EvDecoder.UnknownElementCallback<T>;

  /** Callbacks to receive top-level TLV before decoding TLV-VALUE. */
  public readonly beforeTopCallbacks: Array<EvDecoder.TopElementCallback<T>> = [];
  /** Callbacks before decoding TLV-VALUE. */
  public readonly beforeValueCallbacks: Array<EvDecoder.TargetCallback<T>> = [];
  /** Callbacks after decoding TLV-VALUE. */
  public readonly afterValueCallbacks: Array<EvDecoder.TargetCallback<T>> = [];
  /** Callbacks to receive top-level TLV after decoding TLV-VALUE. */
  public readonly afterTopCallbacks: Array<EvDecoder.TopElementCallback<T>> = [];

  /**
   * Constructor.
   * @param typeName type name, used in error messages.
   * @param topTT if specified, check top-level TLV-TYPE to be in this list.
   */
  constructor(private readonly typeName: string, topTT: number | readonly number[] = []) {
    this.topTT = Array.isArray(topTT) ? (topTT as readonly number[]) : [topTT as number];
    this.unknownCb = () => false;
  }

  /**
   * Add a decoding rule.
   * @param tt TLV-TYPE to match this rule.
   * @param cb callback to handle element TLV.
   * @param options additional rule options.
   */
  public add(tt: number, cb: EvDecoder.ElementCallback<T> | EvDecoder<T>,
      options?: Partial<EvDecoder.RuleOptions>): this {
    if (this.rules.has(tt)) {
      throw new Error(`TLV-TYPE ${printTT(tt)} already has a rule`);
    }

    const rule = {
      cb: cb instanceof EvDecoder ? nest(cb) : cb,
      order: this.nextOrder,
      required: false,
      repeat: false,
      ...options,
    };
    this.nextOrder += AUTO_ORDER_SKIP;

    this.rules.set(tt, rule);
    if (rule.required) {
      this.requiredTlvTypes.add(tt);
    }
    return this;
  }

  /** Set callback to determine whether TLV-TYPE is critical. */
  public setIsCritical(cb: EvDecoder.IsCriticalCallback): this {
    this.isCriticalCb = cb;
    return this;
  }

  /** Set callback to handle unknown elements. */
  public setUnknown(cb: EvDecoder.UnknownElementCallback<T>): this {
    this.unknownCb = cb;
    return this;
  }

  /** Decode TLV to target object. */
  public decode<R extends T = T>(target: R, decoder: Decoder): R {
    const topTlv = decoder.read();
    const { type, vd } = topTlv;
    if (this.topTT.length > 0 && !this.topTT.includes(type)) {
      throw new Error(`TLV-TYPE ${printTT(type)} is not ${this.typeName}`);
    }

    for (const cb of this.beforeTopCallbacks) {
      cb(target, topTlv);
    }
    this.decodeValue(target, vd);
    for (const cb of this.afterTopCallbacks) {
      cb(target, topTlv);
    }
    return target;
  }

  /** Decode TLV-VALUE to target object. */
  public decodeValue<R extends T = T>(target: R, vd: Decoder): R {
    for (const cb of this.beforeValueCallbacks) {
      cb(target);
    }

    let currentOrder = 0;
    let currentCount = 0;
    const missingTlvTypes = new Set(this.requiredTlvTypes);
    while (!vd.eof) {
      const tlv = vd.read();
      const tt = tlv.type;
      missingTlvTypes.delete(tt);

      const rule = this.rules.get(tt);
      if (rule === undefined) {
        if (!this.unknownCb(target, tlv, currentOrder)) {
          this.handleUnrecognized(tt, "unknown");
        }
        continue;
      }

      if (currentOrder > rule.order) {
        this.handleUnrecognized(tt, "out of order");
        continue;
      }

      if (currentOrder < rule.order) {
        currentOrder = rule.order;
        currentCount = 0;
      }
      ++currentCount;
      if (!rule.repeat && currentCount > 1) {
        throw new Error(`TLV-TYPE ${printTT(tt)} cannot repeat in ${this.typeName}`);
      }

      rule.cb(target, tlv);
    }

    if (missingTlvTypes.size > 0) {
      throw new Error(`TLV-TYPE ${Array.from(missingTlvTypes, printTT).join(",")} ${missingTlvTypes.size === 1 ? "is" : "are"} missing in ${this.typeName}`);
    }

    for (const cb of this.afterValueCallbacks) {
      cb(target);
    }
    return target;
  }

  private handleUnrecognized(tt: number, reason: string) {
    if (this.isCriticalCb(tt)) {
      throw new Error(`TLV-TYPE ${printTT(tt)} is ${reason} in ${this.typeName}`);
    }
  }
}

export namespace EvDecoder {
  /** Invoked when a matching TLV element is found. */
  export type ElementCallback<T> = (target: T, tlv: Decoder.Tlv) => void;

  export interface RuleOptions {
    /**
     * Expected order of appearance.
     * Default to the order in which rules were added to EvDecoder.
     */
    order: number;

    /** Whether TLV element must appear at least once. */
    required: boolean;

    /** Whether TLV element may appear more than once. */
    repeat: boolean;
  }

  /**
   * Invoked when a TLV element does not match any rule.
   * 'order' denotes the order number of last recognized TLV element.
   * Return true if this TLV element is accepted, or false to follow evolvability guidelines.
   */
  export type UnknownElementCallback<T> = (target: T, tlv: Decoder.Tlv, order: number) => boolean;

  export type IsCriticalCallback = (tt: number) => boolean;

  export type TopElementCallback<T> = (target: T, tlv: Decoder.Tlv) => void;

  export type TargetCallback<T> = (target: T) => void;
}
