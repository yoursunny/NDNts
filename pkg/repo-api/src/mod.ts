export * from "./bulk-insert-initiator";
export * from "./bulk-insert-target";
export * from "./copy";
export * from "./data-array";
export * from "./data-tape";
export * from "./read-from-network";

/**
 * Namespace consists of interfaces that form the DataStore API.
 *
 * @remarks
 * Each DataStore implementation may support a subset of DataStore API. The supported methods
 * are expressed as a union of these interfaces.
 *
 * There isn't a `.close()` method. A DataStore may implement `Disposable` or `AsyncDisposable`
 * if it should be explicitly closed.
 */
export * as DataStore from "./data-store";

import { replyMetadata } from "./reply-metadata";

export {
  replyMetadata,
  /** @deprecated Use `replyMetadata` instead. */
  replyMetadata as respondRdr,
};
