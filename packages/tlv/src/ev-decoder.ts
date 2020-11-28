import type { Decoder } from "./decoder";
import { printTT } from "./string";

/** Invoked when a matching TLV element is found. */
type ElementCallback<T> = (target: T, tlv: Decoder.Tlv) => void;

interface Rule<T> {
  cb: ElementCallback<T>;

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

type RuleOptions<T> = Partial<Omit<Rule<T>, "cb">>;

const AUTO_ORDER_SKIP = 100;

/**
 * Invoked when a TLV element does not match any rule.
 * 'order' denotes the order number of last recognized TLV element.
 * Return true if this TLV element is accepted, or false to follow evolvability guidelines.
 */
type UnknownElementCallback<T> = (target: T, tlv: Decoder.Tlv, order: number) => boolean;

function nest<T>(evd: EvDecoder<T>): ElementCallback<T> {
  return (target, { decoder }) => { evd.decode(target, decoder); };
}

type IsCriticalCallback = (tt: number) => boolean;

function isCritical(tt: number): boolean {
  return tt <= 0x1F || tt % 2 === 1;
}

type TopElementCallback<T> = (target: T, tlv: Decoder.Tlv) => void;

type TargetCallback<T> = (target: T) => void;

/** TLV-VALUE decoder that understands Packet Format v0.3 evolvability guidelines. */
export class EvDecoder<T> {
  private readonly topTT: readonly number[];
  private readonly rules = new Map<number, Rule<T>>();
  private readonly requiredTlvTypes = new Set<number>();
  private nextOrder = AUTO_ORDER_SKIP;
  private isCriticalCb: IsCriticalCallback = isCritical;
  private unknownCb: UnknownElementCallback<T>;

  /** Callbacks to receive top-level TLV before decoding TLV-VALUE. */
  public readonly beforeTopCallbacks = [] as Array<TopElementCallback<T>>;
  /** Callbacks before decoding TLV-VALUE. */
  public readonly beforeValueCallbacks = [] as Array<TargetCallback<T>>;
  /** Callbacks after decoding TLV-VALUE. */
  public readonly afterValueCallbacks = [] as Array<TargetCallback<T>>;
  /** Callbacks to receive top-level TLV after decoding TLV-VALUE. */
  public readonly afterTopCallbacks = [] as Array<TopElementCallback<T>>;

  /**
   * Constructor.
   * @param typeName type name, used in error messages.
   * @param topTT if specified, check top-level TLV-TYPE to be in this list.
   */
  constructor(private readonly typeName: string, topTT?: number|readonly number[]) {
    // eslint-disable-next-line no-negated-condition
    this.topTT = !topTT ? [] : Array.isArray(topTT) ? topTT : [topTT];
    this.unknownCb = () => false;
  }

  /**
   * Add a decoding rule.
   * @param tt TLV-TYPE to match this rule.
   * @param cb callback to handle element TLV.
   * @param options additional rule options.
   */
  public add(tt: number, cb: ElementCallback<T>|EvDecoder<T>,
      options?: RuleOptions<T>): this {
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
  public setIsCritical(cb: IsCriticalCallback): this {
    this.isCriticalCb = cb;
    return this;
  }

  /** Set callback to handle unknown elements. */
  public setUnknown(cb: UnknownElementCallback<T>): this {
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

    this.beforeTopCallbacks.forEach((cb) => cb(target, topTlv));
    this.decodeValue(target, vd);
    this.afterTopCallbacks.forEach((cb) => cb(target, topTlv));
    return target;
  }

  /** Decode TLV-VALUE to target object. */
  public decodeValue<R extends T = T>(target: R, vd: Decoder): R {
    this.beforeValueCallbacks.forEach((cb) => cb(target));

    let currentOrder = 0;
    let currentCount = 0;
    const missingTlvTypes = new Set(this.requiredTlvTypes);
    while (!vd.eof) {
      const tlv = vd.read();
      const tt = tlv.type;
      missingTlvTypes.delete(tt);

      const rule = this.rules.get(tt);
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

    if (missingTlvTypes.size > 0) {
      throw new Error(`TLV-TYPE ${Array.from(missingTlvTypes).map(printTT).join(",")} ${missingTlvTypes.size === 1 ? "is" : "are"} missing in ${this.typeName}`);
    }

    this.afterValueCallbacks.forEach((cb) => cb(target));
    return target;
  }

  private handleUnrecognized(tt: number, reason: string) {
    if (this.isCriticalCb(tt)) {
      throw new Error(`TLV-TYPE ${printTT(tt)} is ${reason} in ${this.typeName}`);
    }
  }
}
