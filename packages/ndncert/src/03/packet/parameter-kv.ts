import { Encodable, EncodableTlv, toUtf8 } from "@ndn/tlv";

import { TT } from "./an";

type ParameterKV = Record<string, Uint8Array>;
const seenKey = new WeakMap<ParameterKV, string>();

export function parseKey(kv: ParameterKV, key: string) {
  const oldKey = seenKey.get(kv);
  if (typeof oldKey !== "undefined") {
    throw new Error(`missing ParameterValue for ${oldKey}`);
  }
  seenKey.set(kv, key);
}

export function parseValue(kv: ParameterKV, value: Uint8Array) {
  const key = seenKey.get(kv);
  if (typeof key === "undefined") {
    throw new Error("missing ParameterValue");
  }
  seenKey.delete(kv);
  kv[key] = value;
}

export function finish(kv: ParameterKV) {
  const oldKey = seenKey.get(kv);
  if (typeof oldKey !== "undefined") {
    throw new Error(`missing ParameterValue for ${oldKey}`);
  }
}

export function encode(kv: ParameterKV): Encodable[] {
  const list: EncodableTlv[] = [];
  for (const [key, value] of Object.entries(kv)) {
    list.push([TT.ParameterKey, toUtf8(key)], [TT.ParameterValue, value]);
  }
  return list;
}
