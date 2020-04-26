import { PrivateKey, theDigestKey } from "@ndn/keychain";
import { Version } from "@ndn/naming-convention2";
import { Name, NamingConvention } from "@ndn/packet";
import { isDiscoveryInterest, makeMetadataPacket, Metadata } from "@ndn/rdr";

import { Producer } from "./producer";

interface Options {
  versionConvention?: NamingConvention<any, number>;
  signer?: PrivateKey;
}

/**
 * Provide a Producer.FallbackHandler that responds RDR metadata describing latest version
 * among stored Data. This should be passed to Producer.create() options.
 */
export function respondRdr({
  versionConvention = Version,
  signer = theDigestKey,
}: Options = {}): Producer.FallbackHandler {
  return async (interest, producer, store) => {
    if (!isDiscoveryInterest(interest)) {
      return false;
    }
    const prefix = interest.name.getPrefix(-1);

    let bestVersion = -1;
    let bestName: Name|undefined;
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
      return false;
    }

    const metadata: Metadata = { name: bestName };
    return makeMetadataPacket(metadata, { signer });
  };
}
