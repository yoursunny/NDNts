import { timingSafeEqual, webcrypto } from "node:crypto";

export const crypto: Crypto = webcrypto as any;

export { timingSafeEqual };

/** Console on stderr. */
export const console = new globalThis.console.Console(process.stderr);
