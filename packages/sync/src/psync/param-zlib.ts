import { makeZlib } from "../detail/zlib";
import type { PSyncCodec } from "./codec";

/** Use zlib compression with PSync. */
export const PSyncZlib: PSyncCodec.Compression = makeZlib(9);
