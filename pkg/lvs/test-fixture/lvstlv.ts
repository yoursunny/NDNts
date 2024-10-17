import fs from "node:fs/promises";
import path from "node:path";

import { Decoder } from "@ndn/tlv";

import { lvstlv } from "..";

async function loadLVSTLV(filename: string): Promise<lvstlv.LvsModel> {
  return Decoder.decode(
    await fs.readFile(path.join(import.meta.dirname, filename)),
    lvstlv.LvsModel,
  );
}

/** python-ndn LVS model sample "quick example". */
export const pyndn0 = await loadLVSTLV("pyndn0.tlv");

/** python-ndn LVS model sample "signing key suggesting". */
export const pyndn1 = await loadLVSTLV("pyndn1.tlv");

/** python-ndn LVS model sample "compiler and checker demonstration". */
export const pyndn2 = await loadLVSTLV("pyndn2.tlv");
