import { Decoder } from "./decoder";
import { Encodable } from "./encoder";

/** An TLV element that allows extension sub element. */
export interface Extensible {
  [Extensible.TAG]: Extensible.Records;
}

export namespace Extensible {
  export const TAG = Symbol("Extensible");
  export type Records = Record<number, unknown>;
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
  decode(obj: T, tlv: Decoder.Tlv, accumulator?: R): R;

  /**
   * Encode extension element.
   * @param obj parent object.
   * @param value decoded value.
   * @returns encoding of sub element; its TLV-TYPE should be this.tt .
   */
  encode(obj: T, value: R): Encodable;
}

export namespace Extension {
  export function get(obj: Extensible, tt: number): unknown {
    return obj[Extensible.TAG][tt];
  }
  export function set(obj: Extensible, tt: number, value: unknown) {
    obj[Extensible.TAG][tt] = value;
  }
  export function clear(obj: Extensible, tt: number) {
    delete obj[Extensible.TAG][tt];
  }
}

export class ExtensionRegistry<T extends Extensible> {
  private table: Record<number, Extension<T>> = {};
  private order: Record<number, number> = {};

  public registerExtension = <R>(ext: Extension<T, R>) => {
    this.table[ext.tt] = ext;
    this.order[ext.tt] = ext.order || ext.tt;
  }

  public unregisterExtension = (tt: number) => {
    delete this.table[tt];
    delete this.order[tt];
  }

  public decodeUnknown = (target: T, tlv: Decoder.Tlv, order: number) => {
    const { type } = tlv;
    const ext = this.table[type];
    if (!ext) {
      return false;
    }

    const records = target[Extensible.TAG];
    records[type] = ext.decode(target, tlv, records[type]);
    return true;
  }

  public encode(source: T): Encodable[] {
    return Object.entries(source[Extensible.TAG])
    .sort(([ttA], [ttB]) => this.order[ttA] - this.order[ttB])
    .map(([tt, value]) => this.table[tt].encode(source, value));
  }
}
