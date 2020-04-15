import { Encodable, EncodableTlv, toUtf8 } from "@ndn/tlv";

import { TT } from "./an";

type Parameters = Map<string, string>;
const seenKey = new WeakMap<Parameters, string>();

export function parseKey(m: Parameters, key: string) {
  const oldKey = seenKey.get(m);
  if (typeof oldKey !== "undefined") {
    throw new Error(`missing ParameterValue for ${seenKey.get(m)}`);
  }
  seenKey.set(m, key);
}

export function parseValue(m: Parameters, value: string) {
  const key = seenKey.get(m);
  if (typeof key === "undefined") {
    throw new Error("missing ParameterValue");
  }
  seenKey.delete(m);
  m.set(key, value);
}

export function finish(m: Parameters) {
  const oldKey = seenKey.get(m);
  if (typeof oldKey !== "undefined") {
    throw new Error(`missing ParameterValue for ${seenKey.get(m)}`);
  }
}

export function encode(m: Parameters): Encodable[] {
  const list: EncodableTlv[] = [];
  for (const [key, value] of m) {
    list.push([TT.ParameterKey, toUtf8(key)], [TT.ParameterValue, toUtf8(value)]);
  }
  return list;
}
