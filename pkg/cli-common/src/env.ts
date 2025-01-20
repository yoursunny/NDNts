import "dotenv/config";

import { Name } from "@ndn/packet";
import { from } from "env-var";

function determineDefaultUplink(): URL {
  switch (process.platform) {
    case "win32": {
      return new URL("tcp://127.0.0.1:6363");
    }
    case "linux": {
      const u = new URL("unix:///run/nfd/nfd.sock"); // NFD since 2024
      u.searchParams.append("fallback", "/run/nfd.sock"); // NFD until 2023
      u.searchParams.append("fallback", "/run/ndn/nfd.sock"); // ndn6 Docker
      return u;
    }
    default: {
      const u = new URL("unix:///var/run/nfd/nfd.sock"); // NFD since 2024
      u.searchParams.append("fallback", "/var/run/nfd.sock"); // NFD until 2023
      return u;
    }
  }
}

const env = from(process.env, {
  asName(value) {
    return new Name(value);
  },
});

export const keychain = env.get("NDNTS_KEYCHAIN").asString();
export const key = env.get("NDNTS_KEY").asName() ?? new Name();
export const pktTrace = env.get("NDNTS_PKTTRACE").asBool() ?? false;
export const uplink = env.get("NDNTS_UPLINK").asUrlObject() ?? determineDefaultUplink();
export const mtu = env.get("NDNTS_MTU").asIntPositive() ?? 1400;
export const nfdReg = env.get("NDNTS_NFDREG").asBool() ?? true;
export const nfdRegAnn = env.get("NDNTS_NFDREGANN").asBool() ?? false;
export const nfdRegKey = env.get("NDNTS_NFDREGKEY").asName() ?? key;
export const dpdkGql = env.get("NDNTS_NDNDPDK_GQLSERVER").asUrlString();
export const dpdkLocal = env.get("NDNTS_NDNDPDK_LOCAL").asString();
export const dpdkMemifSocketPath = env.get("NDNTS_NDNDPDK_MEMIF_SOCKETPATH").asString();
