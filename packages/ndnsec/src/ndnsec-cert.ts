import { Certificate } from "@ndn/keychain";
import { Data } from "@ndn/packet";

import { invokeNdnsec } from "./ndnsec";

/** Install certificate to ndn-cxx KeyChain. */
export function installCert(cert: Certificate) {
  invokeNdnsec(["cert-install", "-K", "-f-"], { input: Data.getWire(cert.data) });
}
