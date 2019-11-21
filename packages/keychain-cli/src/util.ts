import { Certificate } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";
import fastChunkString from "fast-chunk-string";
import getStdin from "get-stdin";
import stdout from "stdout-stream";

export async function inputCertBase64(): Promise<Certificate> {
  const wire = Buffer.from(await getStdin(), "base64");
  return new Certificate(new Decoder(wire).decode(Data));
}

export function printCertBase64(cert: Certificate) {
  const wire = Encoder.encode(cert.data);
  const b64 = Buffer.from(wire).toString("base64");
  const lines = fastChunkString(b64, { size: 64 });
  for (const line of lines) {
    stdout.write(`${line}\n`);
  }
}
