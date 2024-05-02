import { fromHex, toHex } from "@ndn/util";
import type { GetTagMetadata, Tagged } from "type-fest";

type Tag = "@ndn/browser-tests#serialize";
export type Value<T> = Tagged<string, Tag, T>;

const UINT8ARRAY_TAG = "7030c743-40f7-4c63-96db-2c12c5dfca75";

export function stringify<T>(obj: T): Value<T> {
  return JSON.stringify(obj, (k, v) => {
    if (v instanceof Uint8Array) {
      return [UINT8ARRAY_TAG, toHex(v)];
    }
    return v;
  }) as Value<T>;
}

export function parse<V extends Value<unknown>>(value: V): GetTagMetadata<V, Tag> {
  return JSON.parse(value, (k, v) => {
    if (Array.isArray(v) && v[0] === UINT8ARRAY_TAG) {
      return fromHex(v[1]);
    }
    return v;
  });
}
