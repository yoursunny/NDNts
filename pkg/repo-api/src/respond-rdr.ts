import { Version } from "@ndn/naming-convention2";
import { type Data, digestSigning, type Interest, type Name, type NamingConvention, type Signer } from "@ndn/packet";
import { isDiscoveryInterest, makeMetadataPacket, Metadata } from "@ndn/rdr";

import type * as S from "./data-store";

/**
 * Respond to RDR discovery Interest with RDR metadata describing the latest version
 * among stored Data.
 */
export async function respondRdr(interest: Interest, store: S.ListNames, {
  versionConvention = Version,
  signer = digestSigning,
}: respondRdr.Options = {}): Promise<Data | undefined> {
  if (!isDiscoveryInterest(interest)) {
    return undefined;
  }
  const prefix = interest.name.getPrefix(-1);

  let bestVersion = -1;
  let bestName: Name | undefined;
  for await (const name of store.listNames(prefix)) {
    const comp = name.get(prefix.length);
    if (!comp?.is(versionConvention)) {
      continue;
    }
    const version = comp.as(versionConvention);
    if (version > bestVersion) {
      bestVersion = version;
      bestName = name.getPrefix(prefix.length + 1);
    }
  }
  if (!bestName) {
    return undefined;
  }

  return makeMetadataPacket(new Metadata(bestName), { signer });
}

export namespace respondRdr {
  export interface Options {
    /**
     * Version naming convention.
     * @defaultValue `Version3`
     */
    versionConvention?: NamingConvention<any, number>;

    /**
     * Data signer.
     * @defaultValue digestSigning
     */
    signer?: Signer;
  }
}
