import { Decodable, Decoder } from "@ndn/tlv";
import execa, { ExecaSyncReturnValue } from "execa";

interface Options {
  input?: Uint8Array;
  mustExitZero?: boolean;
}

class NdnsecOutput {
  constructor(private readonly result: ExecaSyncReturnValue) {
  }

  public get exitCode() { return this.result.exitCode; }

  public get lines() { return this.result.stdout.split("\n"); }

  public decode<R>(d: Decodable<R>): R {
    const wire = Buffer.from(this.result.stdout, "base64");
    return new Decoder(wire).decode(d);
  }
}

export function invokeNdnsec(argv: string[], {
  input,
  mustExitZero = true,
}: Options = {}): NdnsecOutput {
  const result = execa.sync("ndnsec", argv, {
    stderr: "inherit",
    input: input ? Buffer.from(input).toString("base64") : undefined,
    env: { NDN_NAME_ALT_URI: "0" },
  });
  if (mustExitZero && result.exitCode !== 0) {
    throw new Error(`ndnsec ${argv[0]} exit code ${result.exitCode}`);
  }
  return new NdnsecOutput(result);
}
