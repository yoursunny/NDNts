import { openKeyChain } from "@ndn/cli-common";
import { Certificate } from "@ndn/keychain";
import { Data } from "@ndn/packet";
import { Decodable, Decoder, Encoder } from "@ndn/tlv";
import fastChunkString from "fast-chunk-string";
import getStdin from "get-stdin";
import stdout from "stdout-stream";

export const keyChain = openKeyChain();

export async function inputBase64<R>(d: Decodable<R>): Promise<R> {
  const wire = Buffer.from(await getStdin(), "base64");
  return new Decoder(wire).decode(d);
}

export async function inputCertBase64(): Promise<Certificate> {
  const data = await inputBase64(Data);
  return new Certificate(data);
}

export function printCertBase64(cert: Certificate) {
  const wire = Encoder.encode(cert.data);
  const b64 = Buffer.from(wire).toString("base64");
  const lines = fastChunkString(b64, { size: 64 });
  for (const line of lines) {
    stdout.write(`${line}\n`);
  }
}
