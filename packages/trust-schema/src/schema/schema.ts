import { Certificate } from "@ndn/keychain";

import { TrustSchemaPolicy } from "./policy";

/** A trust schema. */
export class TrustSchema {
  constructor(
      public readonly policy: TrustSchemaPolicy,
      public readonly trustAnchors: Certificate[],
  ) {
  }
}
