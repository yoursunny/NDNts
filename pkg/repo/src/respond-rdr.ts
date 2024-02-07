import { respondRdr as apiRespondRdr } from "@ndn/repo-api";

import type { RepoProducer } from "./producer";

/**
 * Provide a {@link RepoProducer.FallbackHandler} that responds RDR metadata describing latest
 * version among stored Data.
 *
 * @remarks
 * This should be passed to {@link RepoProducer.create} as part of options.
 */
export function respondRdr(opts: apiRespondRdr.Options = {}): RepoProducer.FallbackHandler {
  return async (interest, producer, store) => apiRespondRdr(interest, store, opts);
}
