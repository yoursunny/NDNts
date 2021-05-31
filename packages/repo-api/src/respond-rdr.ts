import { Version } from "@ndn/naming-convention2";
import { Data, digestSigning, Interest, Name, NamingConvention, Signer } from "@ndn/packet";
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
    if (!comp || !versionConvention.match(comp)) {
      continue;
    }
    const version = versionConvention.parse(comp);
    if (version > bestVersion) {
      bestVersion = version;
      bestName = name.getPrefix(prefix.length + 1);
    }
  }
  if (!bestName) {
    return undefined;
  }

  const metadata: Metadata = { name: bestName };
  return makeMetadataPacket(metadata, { signer });
}

export namespace respondRdr {
  export interface Options {
    versionConvention?: NamingConvention<any, number>;
    signer?: Signer;
  }
}
