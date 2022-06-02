import { Console } from "node:console";
import { timingSafeEqual, webcrypto } from "node:crypto";
import { setTimeout as setTimeoutPromise } from "node:timers/promises";

export { timingSafeEqual };

/** Console on stderr. */
export const console = new Console(process.stderr);

/** Web Crypto API. */
export const crypto: Crypto = webcrypto as any;

export const delay: <T = void>(time: number, value?: T) => Promise<T> = setTimeoutPromise;
