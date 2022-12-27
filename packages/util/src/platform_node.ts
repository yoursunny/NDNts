import { Console } from "node:console";
import { timingSafeEqual, webcrypto } from "node:crypto";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";

export { timingSafeEqual };

/** Console on stderr. */
export const console = new Console(process.stderr);

/** Web Crypto API. */
export const crypto: Crypto = webcrypto as any;

/** Make a Promise that resolves after specified duration. */
export const delay: <T = void>(after: number, value?: T) => Promise<T> = setTimeoutPromise;

/** Concatenate Uint8Arrays. */
export function concatBuffers(arr: readonly Uint8Array[], totalLength?: number): Uint8Array {
  return Buffer.concat(arr, totalLength);
}
