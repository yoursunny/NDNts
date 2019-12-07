import { Name } from "@ndn/packet";
import { makeEnv, parsers } from "@strattadb/environment";
import dotenv from "dotenv";
import loudRejection from "loud-rejection";
import { URL } from "url";

loudRejection();
dotenv.config();

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
  pkttrace: {
    envVarName: "NDNTS_PKTTRACE",
    parser: parsers.boolean,
    required: false,
    defaultValue: false,
  },
  tolerateSelectors: {
    envVarName: "NDNTS_TOLERATE_SELECTORS",
    parser: parsers.boolean,
    required: false,
    defaultValue: false,
  },
  uplink: {
    envVarName: "NDNTS_UPLINK",
    parser: (value) => new URL(value),
    required: false,
    defaultValue: new URL("unix:///run/nfd.sock"),
  },
  nfdreg: {
    envVarName: "NDNTS_NFDREG",
    parser: parsers.boolean,
    required: false,
    defaultValue: false,
  },
  nfdregkey: {
    envVarName: "NDNTS_NFDREGKEY",
    parser: (value) => new Name(value),
    required: false,
    defaultValue: undefined,
  },
});
