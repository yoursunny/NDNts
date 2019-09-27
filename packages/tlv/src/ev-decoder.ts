import { Decoder } from "./decoder";
import { printTT } from "./string";

/** Invoked when a matching TLV element is found. */
type ElementCallback<T> = (target: T, tlv: Decoder.Tlv) => any;

interface Rule<T> {
  cb: ElementCallback<T>;

  /**
   * Expected order of appearance.
   * Default to the order in which rules were added to EvDecoder.
   */
  order: number;

  /** Whether TLV element may appear more than once. */
  repeat: boolean;
}

type RuleOptions<T> = Partial<Omit<Rule<T>, "cb">>;

const AUTO_ORDER_SKIP = 100;

/**
 * Invoked when a TLV element does not match any rule.
 * 'order' denotes the order number of last recognized TLV element.
 * Return true if this TLV element is accepted, or false to follow evolvability guidelines.
 */
type UnknownElementCallback<T> = (target: T, tlv: Decoder.Tlv, order: number) => boolean;

type TopElementCallback<T> = (target: T, tlv: Decoder.Tlv) => any;

function nest<T>(evd: EvDecoder<T>): ElementCallback<T> {
  return (target, { decoder }) => { evd.decode(target, decoder); };
}

type IsCriticalCallback = (tt: number) => boolean;

function isCritical(tt: number): boolean {
  return tt <= 0x1F || tt % 2 === 1;
}

/** TLV-VALUE decoder that understands Packet Format v0.3 evolvability guidelines. */
export class EvDecoder<T> {
  private topTT: number[];
  private rules = {} as Record<number, Rule<T>>;
  private nextOrder = AUTO_ORDER_SKIP;
  private isCriticalCb: IsCriticalCallback = isCritical;
  private unknownCb: UnknownElementCallback<T>;
  private topCb: TopElementCallback<T>;

  /**
   * Constructor.
   * @param typeName type name, used in error messages.
   * @param topTT  if specified, check top-level TLV-TYPE to be in this list.
   */
  constructor(private typeName: string, topTT?: number|number[]) {
    this.topTT = !topTT ? [] : Array.isArray(topTT) ? topTT : [topTT];
    this.unknownCb = () => false;
    this.topCb = () => undefined;
  }

  /**
   * Add a decoding rule.
   * @param tt TLV-TYPE to match this rule.
   * @param cb callback to handle element TLV.
   * @param options additional rule options.
   */
  public add(tt: number, cb: ElementCallback<T>|EvDecoder<T>,
             options?: RuleOptions<T>): this {
    if (typeof this.rules[tt] !== "undefined") {
      throw new Error(`TLV-TYPE ${printTT(tt)} already has a rule`);
    }
    if (cb instanceof EvDecoder) {
      cb = nest(cb);
    }
    this.rules[tt] = Object.assign({ cb, order: this.nextOrder, repeat: false } as Rule<T>, options);
    this.nextOrder += AUTO_ORDER_SKIP;
    return this;
  }

  /** Set callback to determine whether TLV-TYPE is critical. */
  public setIsCritical(cb: IsCriticalCallback): this {
    this.isCriticalCb = cb;
    return this;
  }

  /** Set callback to handle unknown elements. */
  public setUnknown(cb: UnknownElementCallback<T>): this {
    this.unknownCb = cb;
    return this;
  }

  /** Set callback to receive top-level TLV. */
  public setTop(cb: TopElementCallback<T>): this {
    this.topCb = cb;
    return this;
  }

  /** Decode to target object. */
  public decode<R extends T = T>(target: R, decoder: Decoder): R {
    const topTlv = decoder.read();
    const { type, vd } = topTlv;
    if (this.topTT.length && !this.topTT.includes(type)) {
      throw new Error(`TLV-TYPE ${printTT(type)} is not ${this.typeName}`);
    }
    this.topCb(target, topTlv);

    let currentOrder = 0;
    let currentCount = 0;
    while (!vd.eof) {
      const tlv = vd.read();
      const tt = tlv.type;
      const rule: Rule<T>|undefined = this.rules[tt];
      if (typeof rule === "undefined") {
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

    return target;
  }

  private handleUnrecognized(tt: number, reason: string) {
    if (this.isCriticalCb(tt)) {
      throw new Error(`TLV-TYPE ${printTT(tt)} is ${reason} in ${this.typeName}`);
    }
  }
}
