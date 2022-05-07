import { type Data, type Interest, type Name, type NamingConvention, Component } from "@ndn/packet";
import { type EvDecoder, Decoder } from "@ndn/tlv";

import { C } from "./an";

export function checkName(
    { name }: { name: Name },
    { prefix: caPrefix }: { prefix: Name },
    ...comps: Array<Component | NamingConvention<any> | undefined>
): void {
  if (name.length !== caPrefix.length + 1 + comps.length ||
      !name.getPrefix(caPrefix.length).equals(caPrefix) ||
      !name.get(caPrefix.length)!.equals(C.CA) ||
      !comps.every((comp, i) => {
        if (comp === undefined) {
          return true;
        }
        const c = name.get(caPrefix.length + 1 + i);
        if (comp instanceof Component) {
          return c!.equals(comp);
        }
        return c!.is(comp);
      })) {
    throw new Error("bad Name");
  }
}

export async function fromInterest<T extends Readonly<Fields>, Fields extends {}>(
    interest: Interest,
    evd: EvDecoder<Fields>,
    fn: (fields: Fields) => T | Promise<T>,
): Promise<T> {
  await interest.validateParamsDigest(true);
  const fields = evd.decodeValue({} as Fields, new Decoder(interest.appParameters!));
  return Object.assign(await fn(fields), fields);
}

export async function fromData<T extends Readonly<Fields>, Fields extends {}>(
    data: Data,
    evd: EvDecoder<Fields>,
    fn: (fields: Fields) => T | Promise<T>,
) {
  const fields = evd.decodeValue({} as Fields, new Decoder(data.content));
  return Object.assign(await fn(fields), fields);
}
