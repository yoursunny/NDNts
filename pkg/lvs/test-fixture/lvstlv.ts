import fs from "node:fs";
import path from "node:path";

import { Decoder } from "@ndn/tlv";

import { lvstlv } from "..";

function loadLVSTLV(filename: string): () => lvstlv.LvsModel {
  return () => Decoder.decode(
    fs.readFileSync(path.join(import.meta.dirname, filename)),
    lvstlv.LvsModel,
  );
}

/** python-ndn LVS model sample "quick example". */
export const pyndn0 = loadLVSTLV("pyndn0.tlv");

/** python-ndn LVS model sample "signing key suggesting". */
export const pyndn1 = loadLVSTLV("pyndn1.tlv");

/** python-ndn LVS model sample "compiler and checker demonstration". */
export const pyndn2 = loadLVSTLV("pyndn2.tlv");

/** python-ndn LVS model sample "user functions". */
export const pyndn3 = loadLVSTLV("pyndn3.tlv");

/** python-ndn LVS model sample "test_complicated_rule". */
export const pyndn4 = loadLVSTLV("pyndn4.tlv");

/** python-ndn LVS model sample "test_complicated_redef". */
export const pyndn5 = loadLVSTLV("pyndn5.tlv");
