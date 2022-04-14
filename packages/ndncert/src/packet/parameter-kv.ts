import { type Encodable, EvDecoder } from "@ndn/tlv";
import { toUtf8 } from "@ndn/util";

import { TT } from "./an";

/** Parameter key-value pair. */
export type ParameterKV = Record<string, Uint8Array>;

const seenKey = new WeakMap<ParameterKV, string>();

function parseKey(kv: ParameterKV, key: string) {
  finish(kv);
  seenKey.set(kv, key);
}

function parseValue(kv: ParameterKV, value: Uint8Array) {
  const key = seenKey.get(kv);
  if (key === undefined) {
    throw new Error("missing ParameterKey");
  }
  seenKey.delete(kv);
  kv[key] = value;
}

function finish(kv: ParameterKV) {
  const oldKey = seenKey.get(kv);
  if (oldKey !== undefined) {
    throw new Error(`missing ParameterValue for ${oldKey}`);
  }
}

export function parseEvDecoder<R extends { parameters?: ParameterKV }>(evd: EvDecoder<R>, order: number): void {
  evd
    .add(TT.ParameterKey, (t, { text }) => parseKey(t.parameters!, text), { order, repeat: true })
    .add(TT.ParameterValue, (t, { value }) => parseValue(t.parameters!, value), { order, repeat: true });
  evd.beforeValueCallbacks.push((t) => t.parameters ??= {});
  evd.afterValueCallbacks.push((t) => finish(t.parameters!));
}

export function encode(kv: ParameterKV = {}): Encodable[] {
  return Object.entries(kv).flatMap(([key, value]) => [
    [TT.ParameterKey, toUtf8(key)],
    [TT.ParameterValue, value],
  ]);
}
