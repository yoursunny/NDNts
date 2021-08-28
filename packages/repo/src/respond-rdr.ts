import { respondRdr as apiRespondRdr } from "@ndn/repo-api";

import type { Producer } from "./producer";

/**
 * Provide a Producer.FallbackHandler that responds RDR metadata describing latest version
 * among stored Data. This should be passed to Producer.create() options.
 */
export function respondRdr(opts: apiRespondRdr.Options = {}): Producer.FallbackHandler {
  return async (interest, producer, store) => apiRespondRdr(interest, store, opts);
}
