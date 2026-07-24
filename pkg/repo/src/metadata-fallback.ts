import { replyMetadata } from "@ndn/repo-api";

import type { RepoProducer } from "./producer";

/**
 * Provide a {@link RepoProducer.FallbackHandler} that replies to metadata discovery Interests.
 *
 * @remarks
 * The returned function should be passed as {@link RepoProducer.Options.fallback}.
 */
export function metadataFallback(opts: replyMetadata.Options = {}): RepoProducer.FallbackHandler {
  return (interest, producer, store) => {
    void producer;
    return replyMetadata(interest, store, opts);
  };
}
