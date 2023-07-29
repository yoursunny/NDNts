import { Component, type Data, type Interest, type Name, type NamingConvention } from "@ndn/packet";
import { Decoder, type EvDecoder } from "@ndn/tlv";
import type { Promisable } from "type-fest";

import { C } from "./an";

/**
 * Verify packet name.
 * First parameter is an Interest or Data packet.
 * Second parameter is the CA profile.
 * Rest parameters match name components after "CA" component, `undefined` matches anything.
 */
export function checkName(
    { name }: { name: Name },
    { prefix: caPrefix }: { prefix: Name },
    ...comps: Array<Component | NamingConvention<any> | undefined>
): void {
  if (name.length !== caPrefix.length + 1 + comps.length ||
      !name.getPrefix(caPrefix.length).equals(caPrefix) ||
      !name.get(caPrefix.length)!.equals(C.CA) ||
      !comps.every((comp, i) => {
        const c = name.get(caPrefix.length + 1 + i)!;
        return comp === undefined || (comp instanceof Component ? c.equals(comp) : c.is(comp));
      })) {
    throw new Error("bad Name");
  }
}

/**
 * Decode from Interest AppParameters.
 * @param interest source Interest.
 * @param evd fields decoder.
 * @param fn function to create result packet; fields will be assigned onto it.
 * @returns result packet.
 */
export async function fromInterest<T extends Readonly<Fields>, Fields extends {}>(
    interest: Interest,
    evd: EvDecoder<Fields>,
    fn: (fields: Fields) => Promisable<T>,
): Promise<T> {
  await interest.validateParamsDigest(true);
  const fields = evd.decodeValue({} as Fields, new Decoder(interest.appParameters!));
  return Object.assign(await fn(fields), fields);
}

/**
 * Decode from Data Content.
 * @param data source Data.
 * @param evd fields decoder.
 * @param fn function to create result packet; fields will be assigned onto it.
 * @returns result packet.
 */
export async function fromData<T extends Readonly<Fields>, Fields extends {}>(
    data: Data,
    evd: EvDecoder<Fields>,
    fn: (fields: Fields) => Promisable<T>,
) {
  const fields = evd.decodeValue({} as Fields, new Decoder(data.content));
  return Object.assign(await fn(fields), fields);
}
