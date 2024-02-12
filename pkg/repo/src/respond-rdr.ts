import { respondRdr as apiRespondRdr } from "@ndn/repo-api";

import type { RepoProducer } from "./producer";

/**
 * Provide a {@link RepoProducer.FallbackHandler} that responds RDR metadata describing latest
 * version among stored Data.
 *
 * @remarks
 * The returned function should be passed as {@link RepoProducer.Options.fallback}.
 */
export function respondRdr(opts: apiRespondRdr.Options = {}): RepoProducer.FallbackHandler {
  return (interest, producer, store) => {
    void producer;
    return apiRespondRdr(interest, store, opts);
  };
}
