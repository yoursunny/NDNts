import { Console } from "node:console";
import { timingSafeEqual } from "node:crypto";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";

export { timingSafeEqual };

/** Concatenate Uint8Arrays. */
export function concatBuffers(arr: readonly Uint8Array[], totalLength?: number): Uint8Array {
  return Buffer.concat(arr, totalLength);
}

/** Console on stderr. */
export const console = new Console(process.stderr);

/** Make a Promise that resolves after specified duration. */
export const delay: <T = void>(after: number, value?: T) => Promise<T> = setTimeoutPromise;
