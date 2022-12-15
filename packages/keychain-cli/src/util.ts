import { openKeyChain, openUplinks } from "@ndn/cli-common";
import { type KeyChain, Certificate } from "@ndn/keychain";
import { type ClientConf, CaProfile, importClientConf, ProbeResponse, retrieveCaProfile } from "@ndn/ndncert";
import { Data, Name } from "@ndn/packet";
import { type Decodable, Decoder, Encoder } from "@ndn/tlv";
import { fromUtf8 } from "@ndn/util";
import fastChunkString from "fast-chunk-string";
import getStdin from "get-stdin";
import { promises as fs } from "graceful-fs";
import stdout from "stdout-stream";

export const keyChain: KeyChain = openKeyChain();

export async function inputBase64<R>(d: Decodable<R>, filename?: string): Promise<R> {
  const read = filename ? fs.readFile(filename, "utf8") : getStdin();
  const wire = Buffer.from(await read, "base64");
  return new Decoder(wire).decode(d);
}

export async function inputCertBase64(filename?: string): Promise<Certificate> {
  const data = await inputBase64(Data, filename);
  return Certificate.fromData(data);
}

export async function inputCaProfile(filename: string, strict = false): Promise<CaProfile> {
  if (!strict) {
    const name = new Name(filename);
    if (ProbeResponse.isCaCertFullName(name)) {
      await openUplinks();
      return retrieveCaProfile({ caCertFullName: name });
    }
  }

  const content = await fs.readFile(filename);
  try {
    return await CaProfile.fromData(new Decoder(content).decode(Data));
  } catch (err: unknown) {
    if (strict) {
      throw err;
    }

    try {
      return await inputCaProfileFromClientConf(content);
    } catch (errC: unknown) {
      throw new AggregateError([err, errC],
        `cannot parse as Data (${err}); cannot import from client.conf (${errC})`);
    }
  }
}

async function inputCaProfileFromClientConf(content: Uint8Array): Promise<CaProfile> {
  await openUplinks();
  const conf: ClientConf = JSON.parse(fromUtf8(content));
  return importClientConf(conf);
}

export function printCertBase64(cert: Certificate) {
  const wire = Encoder.encode(cert.data);
  const b64 = Buffer.from(wire).toString("base64");
  const lines = fastChunkString(b64, { size: 64 });
  for (const line of lines) {
    stdout.write(`${line}\n`);
  }
}
