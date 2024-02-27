import type { Encodable, Encoder } from "./encoder";
import type { EvDecoder } from "./ev-decoder";
import { type StructFieldType } from "./struct-field";

export interface Field<T> extends Required<EvDecoder.RuleOptions> {
  readonly tt: number;
  readonly key: string;
  newValue: () => T;
  encode: (v: T) => Iterable<Encodable | typeof Encoder.OmitEmpty>;
  asString: (v: T) => Iterable<string>;
}

interface Options extends EvDecoder.RuleOptions {
  required?: boolean;
  repeat?: boolean;
}

export function makeField<T>(
    tt: number,
    key: string,
    type: StructFieldType<T>,
    opts: Options,
    evd: EvDecoder<any>,
): Field<T[]> | Field<T | undefined> {
  const fo = { ...opts, ...(evd ? evd.applyDefaultsToRuleOptions(opts) : {
    order: tt,
    required: false,
    repeat: false,
  }) };
  evd.add(
    tt,
    fo.repeat ?
      (t, tlv) => t[key].push(type.decode(tlv)) :
      (t, tlv) => t[key] = type.decode(tlv),
    fo,
  );

  const { asString: itemAsString = (value) => `${value}` } = type;
  if (fo.repeat) {
    return {
      ...fo,
      tt,
      key,
      newValue: () => [],
      *encode(vec) {
        for (const item of vec) {
          yield type.encode(item);
        }
      },
      *asString(vec) {
        if (vec.length === 0) {
          return;
        }
        let delim = ` ${key}=[`;
        for (const item of vec) {
          yield `${delim}${itemAsString(item)}`;
          delim = ", ";
        }
        yield "]";
      },
    } satisfies Field<T[]>;
  }

  return {
    ...fo,
    tt,
    key,
    newValue: fo.required ? type.newValue : () => undefined,
    *encode(v) {
      if (v !== undefined) {
        yield type.encode(v);
      }
    },
    asString: function*(v) {
      if (v !== undefined) {
        yield ` ${key}=${itemAsString(v)}`;
      }
    },
  } satisfies Field<T | undefined>;
}

export function sortFields(fields: Array<Field<any>>): void {
  fields.sort(({ order: a }, { order: b }) => a - b);
}

export function encodeFields(fields: ReadonlyArray<Field<any>>, obj: Record<string, any>): Encodable[] {
  const elements: Encodable[] = [];
  for (const { tt, key, encode } of fields) {
    for (const value of encode(obj[key])) {
      elements.push([tt, value as Encodable]);
    }
  }
  return elements;
}
