import { Crypto as peculiarCrypto } from "@peculiar/webcrypto";

export const crypto = new peculiarCrypto() as Crypto; // export as DOM Crypto type
