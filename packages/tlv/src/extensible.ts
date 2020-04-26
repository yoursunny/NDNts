import { Decoder, Encodable } from "./mod";

/** An TLV element that allows extension sub element. */
export interface Extensible {
  [Extensible.TAG]: Extensible.Records;
}

export namespace Extensible {
  export const TAG = Symbol("Extensible");
  export type Records = Map<number, unknown>;
  export function newRecords() {
    return new Map<number, unknown>();
  }
}

/**
 * An extension sub element on a parent TLV element.
 * T is the parent TLV element type.
 * R is the value type of this extension.
 */
export interface Extension<T, R = unknown> {
  /** TLV-TYPE. */
  readonly tt: number;

  /** Order relative to other extensions, used on encoding only. */
  readonly order?: number;

  /**
   * Decode extension element.
   * @param obj parent object.
   * @param tlv TLV of sub element; its TLV-TYPE would be this.tt .
   * @param accumulator previous decoded value, if extension element appears more than once.
   */
  decode: (obj: T, tlv: Decoder.Tlv, accumulator?: R) => R;

  /**
   * Encode extension element.
   * @param obj parent object.
   * @param value decoded value.
   * @returns encoding of sub element; its TLV-TYPE should be this.tt .
   */
  encode: (obj: T, value: R) => Encodable;
}

export namespace Extension {
  export function get(obj: Extensible, tt: number): unknown {
    return obj[Extensible.TAG].get(tt);
  }
  export function set(obj: Extensible, tt: number, value: unknown) {
    obj[Extensible.TAG].set(tt, value);
  }
  export function clear(obj: Extensible, tt: number) {
    obj[Extensible.TAG].delete(tt);
  }
}

export class ExtensionRegistry<T extends Extensible> {
  private table = new Map<number, Extension<T, any>>();

  public registerExtension = <R>(ext: Extension<T, R>) => {
    this.table.set(ext.tt, ext);
  };

  public unregisterExtension = (tt: number) => {
    this.table.delete(tt);
  };

  public decodeUnknown = (target: T, tlv: Decoder.Tlv, order: number) => {
    const { type: tt } = tlv;
    const ext = this.table.get(tt);
    if (!ext) {
      return false;
    }

    const records = target[Extensible.TAG];
    records.set(tt, ext.decode(target, tlv, records.get(tt)));
    return true;
  };

  public encode(source: T): Encodable[] {
    return Array.from(source[Extensible.TAG])
      .map(([tt, value]) => {
        const ext = this.table.get(tt);
        if (!ext) {
          throw new Error(`unknown extension type ${tt}`);
        }
        return { tt, value, ext };
      })
      .sort(({ tt: ttA, ext: { order: orderA } },
          { tt: ttB, ext: { order: orderB } }) => (orderA ?? ttA) - (orderB ?? ttB))
      .map(({ tt, value, ext }) => ext.encode(source, value));
  }
}
