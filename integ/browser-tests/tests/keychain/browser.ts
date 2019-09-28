import { theDigestKey } from "@ndn/keychain";
import { execute as testSignVerify } from "@ndn/keychain/test-fixture/sign-verify";
import { Data, Interest } from "@ndn/l3pkt";

import { serializeInBrowser } from "../../test-fixture/serialize";

import "./api";

window.testDigestKey = async () => {
  return serializeInBrowser(await Promise.all([
    testSignVerify(Interest, theDigestKey, theDigestKey, theDigestKey, theDigestKey),
    testSignVerify(Data, theDigestKey, theDigestKey, theDigestKey, theDigestKey),
  ]));
};
