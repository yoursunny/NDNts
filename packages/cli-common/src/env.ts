import "dotenv/config";

import { Name } from "@ndn/packet";
import { makeEnv, parsers } from "@sadams/environment";

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

export const env = makeEnv({
  keychain: {
    envVarName: "NDNTS_KEYCHAIN",
    parser: parsers.string,
    required: false,
    defaultValue: undefined,
  },
  key: {
    envVarName: "NDNTS_KEY",
    parser: Name.from,
    required: false,
    defaultValue: undefined,
  },
  pktTrace: {
    envVarName: "NDNTS_PKTTRACE",
    parser: parsers.boolean,
    required: false,
    defaultValue: false,
  },
  uplink: {
    envVarName: "NDNTS_UPLINK",
    parser: (value) => new URL(value),
    required: false,
    defaultValue: determineDefaultUplink(),
  },
  mtu: {
    envVarName: "NDNTS_MTU",
    parser: parsers.positiveInteger,
    required: false,
    defaultValue: 1400,
  },
  nfdReg: {
    envVarName: "NDNTS_NFDREG",
    parser: parsers.boolean,
    required: false,
    defaultValue: true,
  },
  nfdRegKey: {
    envVarName: "NDNTS_NFDREGKEY",
    parser: Name.from,
    required: false,
    defaultValue: undefined,
  },
  dpdkGql: {
    envVarName: "NDNTS_NDNDPDK_GQLSERVER",
    parser: parsers.url,
    required: false,
    defaultValue: undefined,
  },
  dpdkLocal: {
    envVarName: "NDNTS_NDNDPDK_LOCAL",
    parser: parsers.ipAddress,
    required: false,
    defaultValue: undefined,
  },
  dpdkMemifSocketPath: {
    envVarName: "NDNTS_NDNDPDK_MEMIF_SOCKETPATH",
    parser: parsers.string,
    required: false,
    defaultValue: undefined,
  },
});
