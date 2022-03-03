import type { Endpoint, RetxPolicy } from "@ndn/endpoint";

import type { CaProfile } from "../packet/mod";

export interface ClientOptionsCommon {
  /** Endpoint for communication. */
  endpoint?: Endpoint;

  /** Interest retransmission policy, default is 4 retransmissions. */
  retx?: RetxPolicy;

  profile: CaProfile;
}
