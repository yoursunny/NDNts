import "dotenv/config";

import { Name } from "@ndn/packet";
import { makeEnv, parsers } from "@strattadb/environment";

const {
  [process.platform]: defaultUplink = "unix:///var/run/nfd.sock",
}: Partial<Record<NodeJS.Platform, string>> = {
  linux: "unix:///run/nfd.sock",
  win32: "tcp://127.0.0.1:6363",
};

export const env = makeEnv({
  keychain: {
    envVarName: "NDNTS_KEYCHAIN",
    parser: parsers.string,
    required: false,
    defaultValue: undefined,
  },
  key: {
    envVarName: "NDNTS_KEY",
    parser: (value) => new Name(value),
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
    defaultValue: new URL(defaultUplink),
  },
  mtu: {
    envVarName: "NDNTS_MTU",
    parser: parsers.positiveInteger,
    required: false,
    defaultValue: 1450,
  },
  nfdReg: {
    envVarName: "NDNTS_NFDREG",
    parser: parsers.boolean,
    required: false,
    defaultValue: true,
  },
  nfdRegKey: {
    envVarName: "NDNTS_NFDREGKEY",
    parser: (value) => new Name(value),
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
