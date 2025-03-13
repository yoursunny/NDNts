import type { Encodable, EvDecoder } from "@ndn/tlv";
import { assert, toUtf8 } from "@ndn/util";

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
  assert(key !== undefined, "missing ParameterKey");
  seenKey.delete(kv);
  kv[key] = value;
}

function finish(kv: ParameterKV) {
  const oldKey = seenKey.get(kv);
  assert(oldKey === undefined, `missing ParameterValue for ${oldKey}`);
}

/**
 * Define fields on EvDecoder to recognize pairs of ParameterKey and ParameterValue TLVs.
 * @param evd - EvDecoder of parent TLV.
 * @param order - Field order for both ParameterKey and ParameterValue.
 */
export function parseEvDecoder<R extends { parameters?: ParameterKV }>(evd: EvDecoder<R>, order: number): void {
  evd
    .add(TT.ParameterKey, (t, { text }) => parseKey(t.parameters!, text), { order, repeat: true })
    .add(TT.ParameterValue, (t, { value }) => parseValue(t.parameters!, value), { order, repeat: true });
  evd.beforeObservers.push((t) => t.parameters ??= {});
  evd.afterObservers.push((t) => finish(t.parameters!));
}

/** Encode pairs of ParameterKey and ParameterValue TLVs. */
export function encode(kv: ParameterKV = {}): Encodable[] {
  return Object.entries(kv).flatMap(([key, value]) => [
    [TT.ParameterKey, toUtf8(key)],
    [TT.ParameterValue, value],
  ]);
}
