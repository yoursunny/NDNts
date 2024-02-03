export * from "./bulk-insert-initiator";
export * from "./bulk-insert-target";
export * from "./copy";
export * from "./data-tape";
export * from "./respond-rdr";

/**
 * Namespace consists of interfaces that form the DataStore API.
 *
 * @remarks
 * Each DataStore implementation may support a subset of DataStore API. The supported methods
 * are expressed as a union of these interfaces.
 */
export * as DataStore from "./data-store";
