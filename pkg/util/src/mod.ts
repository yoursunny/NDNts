import "./polyfill_node";

import assert from "tiny-invariant";

export { assert };
export { console, concatBuffers, delay } from "./platform_node";

export * from "./buffer";
export * from "./closers";
export * from "./crypto";
export * from "./event";
export * from "./iter";
export * from "./key-map";
export * from "./number";
export * from "./reorder";
export * from "./string";
export * from "./timer";

/** @deprecated Use `crypto` global object instead. */
export const crypto = globalThis.crypto;
