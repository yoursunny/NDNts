import fs from "node:fs/promises";

import { openKeyChain, openUplinks } from "@ndn/cli-common";
import { type KeyChain, Certificate } from "@ndn/keychain";
import { type ClientConf, type ParameterKV, CaProfile, importClientConf, ProbeResponse, retrieveCaProfile } from "@ndn/ndncert";
import { Data, Name } from "@ndn/packet";
import { type Decodable, Decoder, Encoder } from "@ndn/tlv";
import { fromUtf8, toUtf8 } from "@ndn/util";
import fastChunkString from "fast-chunk-string";
import getStdin from "get-stdin";
import prompts from "prompts";
import stdout from "stdout-stream";

export const keyChain: KeyChain = openKeyChain();

/** Read base64 object from file or stdin. */
export async function inputBase64<R>(d: Decodable<R>, filename?: string): Promise<R> {
  const read = filename ? fs.readFile(filename, "utf8") : getStdin();
  const wire = Buffer.from(await read, "base64");
  return new Decoder(wire).decode(d);
}

/** Read base64 certificate from file or stdin. */
export async function inputCertBase64(filename?: string): Promise<Certificate> {
  const data = await inputBase64(Data, filename);
  return Certificate.fromData(data);
}

/**
 * Read or retrieve CA profile from file or name.
 * @param filename filename or NDN name.
 * @param strict if true, must be a binary file; otherwise, retrieval is allowed.
 */
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

/** yargs .pp (probe parameter) option definition. */
export type PPOption = string | string[];
export namespace PPOption {
  /**
   * Define .pp option with `.option("pp", PPOption.def)`.
   * It's compatible with promptProbeParameters `known` parameter.
   */
  export const def = {
    desc: "PROBE parameter key value pair",
    default: [] as string[],
    nargs: 2,
    type: "string",
  } as const;
}

/**
 * Prompt for PROBE parameters.
 * @param profile CA profile.
 * @param known alternated key value pairs, such as `["email", "someone@contoso.com"]`.
 */
export async function promptProbeParameters(profile: CaProfile, known: readonly string[]): Promise<ParameterKV> {
  const questions: prompts.PromptObject[] = [];
  for (const key of profile.probeKeys) {
    questions.push({
      type: "text",
      name: key,
      message: `Probe parameter ${key}`,
    });
  }

  const overrides: Record<string, string> = {};
  for (let i = 0; i < known.length; i += 2) {
    const key = known[i]!;
    const value = known[i + 1];
    if (value === undefined) {
      continue;
    }
    overrides[key] = value;
  }
  prompts.override(overrides);

  let response: prompts.Answers<string>;
  try {
    response = await prompts(questions);
  } finally {
    prompts.override({});
  }

  const parameters: ParameterKV = {};
  for (const key of profile.probeKeys) {
    parameters[key] = toUtf8(String(response[key]));
  }
  return parameters;
}

/** Write certificate base64 to stdout. */
export function printCertBase64(cert: Certificate) {
  const wire = Encoder.encode(cert.data);
  const b64 = Buffer.from(wire).toString("base64");
  const lines = fastChunkString(b64, { size: 64 });
  for (const line of lines) {
    stdout.write(`${line}\n`);
  }
}
