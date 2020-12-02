import { openKeyChain } from "@ndn/cli-common";
import { Certificate, KeyChain } from "@ndn/keychain";
import { CaProfile } from "@ndn/ndncert";
import { Data } from "@ndn/packet";
import { Decodable, Decoder, Encoder } from "@ndn/tlv";
import fastChunkString from "fast-chunk-string";
import getStdin from "get-stdin";
import { promises as fs } from "graceful-fs";
import stdout from "stdout-stream";

export const keyChain: KeyChain = openKeyChain();

export async function inputBase64<R>(d: Decodable<R>, filename?: string): Promise<R> {
  const read = filename ? fs.readFile(filename, { encoding: "utf-8" }) : getStdin();
  const wire = Buffer.from(await read, "base64");
  return new Decoder(wire).decode(d);
}

export async function inputCertBase64(filename?: string): Promise<Certificate> {
  const data = await inputBase64(Data, filename);
  return Certificate.fromData(data);
}

export async function inputCaProfile(filename: string): Promise<CaProfile> {
  return CaProfile.fromData(new Decoder(await fs.readFile(filename)).decode(Data));
}

export function printCertBase64(cert: Certificate) {
  const wire = Encoder.encode(cert.data);
  const b64 = Buffer.from(wire).toString("base64");
  const lines = fastChunkString(b64, { size: 64 });
  for (const line of lines) {
    stdout.write(`${line}\n`);
  }
}
