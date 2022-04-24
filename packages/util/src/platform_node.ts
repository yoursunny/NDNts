import { Console } from "node:console";
import { timingSafeEqual, webcrypto } from "node:crypto";

export const crypto: Crypto = webcrypto as any;

export { timingSafeEqual };

/** Console on stderr. */
export const console = new Console(process.stderr);
