import { webcrypto } from "node:crypto";

export const crypto: Crypto = webcrypto as any;
