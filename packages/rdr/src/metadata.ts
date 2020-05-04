import { Keyword } from "@ndn/naming-convention2";
import { Component, Name, TT } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

/** 32=metadata component. */
export const MetadataKeyword: Component = Keyword.create("metadata");

/** RDR metadata packet content. */
export interface Metadata {
  /** Versioned name. */
  name: Name;
}

/** Encode RDR metadata packet content. */
export function encodeMetadataContent({ name }: Metadata): Uint8Array {
  const encoder = new Encoder();
  encoder.prependValue(name);
  return encoder.output;
}

/** Decode RDR metadata packet content. */
export function decodeMetadataContent(wire: Uint8Array): Metadata {
  const d = new Decoder(wire);
  while (!d.eof) {
    const { type, decoder: d1 } = d.read();
    if (type === TT.Name) {
      const name = d1.decode(Name);
      return { name };
    }
  }
  throw new Error("invalid RDR metadata Content");
}
