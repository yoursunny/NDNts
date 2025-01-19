import { getOrInsert } from "@ndn/util";

import type { Encodable } from "./encoder";
import { EvDecoder } from "./ev-decoder";
import { encodeFields, type Field, makeField, sortFields } from "./impl-field";
import type { StructFieldType } from "./struct-field";

const RECORDS = new WeakMap<Extensible, Record<string, any>>();

function getOrCreateRecord(obj: Extensible): Record<string, any> {
  return getOrInsert(RECORDS, obj, () => ({}));
}

/** An TLV element that allows extension sub element. */
export interface Extensible {
  readonly [Extensible.TAG]: ExtensionRegistry<any>;
}

export namespace Extensible {
  export const TAG = Symbol("@ndn/tlv#Extensible");

  /** Clone extension fields of src to dst. */
  export function cloneRecord(dst: Extensible, src: Extensible): void {
    const record = RECORDS.get(src);
    if (record !== undefined) {
      RECORDS.set(dst, record);
    }
  }

  /**
   * Define simple getters and setters.
   * @param typ - Extensible subclass constructor.
   * @param exts - Extensions, each key is a property name and each value is the TLV-TYPE number.
   */
  export function defineGettersSetters<T extends Extensible>(typ: new() => T, exts: Record<string, number>): void {
    for (const [prop, tt] of Object.entries(exts)) {
      Object.defineProperty(typ.prototype, prop, {
        enumerable: true,
        get(this: T) {
          return Extension.get(this, tt);
        },
        set(this: T, value: unknown) {
          if (value === undefined) {
            Extension.clear(this, tt);
          } else {
            Extension.set(this, tt, value);
          }
        },
      });
    }
  }
}

export namespace Extension {
  /** Retrieve value of an extension field. */
  export function get(obj: Extensible, tt: number): unknown {
    return RECORDS.get(obj)?.[`ext_${tt}`];
  }

  /** Assign value of an extension field. */
  export function set(obj: Extensible, tt: number, value: unknown): void {
    getOrCreateRecord(obj)[`ext_${tt}`] = value;
  }

  /** Clear value of an extension field. */
  export function clear(obj: Extensible, tt: number): void {
    delete RECORDS.get(obj)?.[`ext_${tt}`];
  }
}

export interface ExtensionOptions {
  order?: number;
}

/** Registry of known extension fields of a parent TLV element. */
export class ExtensionRegistry<T extends Extensible> {
  private hasUnrecognized = false;
  private readonly evd = new EvDecoder<Record<string, any>>("ExtensionRegistry")
    .setUnknown(() => {
      this.hasUnrecognized = true;
      return false;
    })
    .setIsCritical(EvDecoder.neverCritical);

  private readonly fields: Array<Field<any>> = [];

  /** Add an extension. */
  public readonly register = <R>(tt: number, type: StructFieldType<R>, opts: ExtensionOptions = {}): void => {
    opts.order ??= tt;
    this.fields.push(makeField(tt, `ext_${tt}`, type, opts, this.evd));
    sortFields(this.fields);
  };

  /** UnknownElementCallback for EvDecoder. */
  public readonly decodeUnknown: EvDecoder.UnknownElementHandler<T> = (target, tlv) => {
    const record = getOrCreateRecord(target);
    this.hasUnrecognized = false;
    this.evd.decodeValue(record, tlv.decoder);
    return !this.hasUnrecognized;
  };

  /** Encode extension fields. */
  public encode(source: T): Encodable[] {
    const record = RECORDS.get(source);
    if (!record) {
      return [];
    }
    return encodeFields(this.fields, record);
  }
}
