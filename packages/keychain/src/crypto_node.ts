import { Crypto as peculiarCrypto } from "@peculiar/webcrypto";
import * as nodeCrypto from "crypto";

export const crypto: Crypto = (nodeCrypto as any).webcrypto ?? new peculiarCrypto();
