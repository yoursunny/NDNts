import * as nodeCrypto from "node:crypto";

// @ts-expect-error typing error in @peculiar/webcrypto as of @types/web 0.0.26
import { Crypto as peculiarCrypto } from "../peculiar-webcrypto.cjs";

export const crypto: Crypto = (nodeCrypto.webcrypto as any) ?? new peculiarCrypto();
