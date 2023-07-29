import { fromHex, toHex } from "@ndn/util";
import type { Opaque, UnwrapOpaque } from "type-fest";

export type Value<T> = Opaque<string, T>;

const UINT8ARRAY_TAG = "7030c743-40f7-4c63-96db-2c12c5dfca75";

export function stringify<T>(obj: T): Value<T> {
  return JSON.stringify(obj, (k, v) => {
    if (v instanceof Uint8Array) {
      return [UINT8ARRAY_TAG, toHex(v)];
    }
    return v;
  }) as Value<T>;
}

export function parse<T>(value: Value<T>): T {
  return JSON.parse(value as UnwrapOpaque<Value<T>>, (k, v) => {
    if (Array.isArray(v) && v[0] === UINT8ARRAY_TAG) {
      return fromHex(v[1]);
    }
    return v;
  }) as T;
}
