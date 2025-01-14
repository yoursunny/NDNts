import { exitClosers, openUplinks } from "@ndn/cli-common";
import { createSigner, createVerifier, HMAC } from "@ndn/keychain";
import { Name } from "@ndn/packet";
import { SvSync } from "@ndn/svs";
import yargs from "yargs";
import { hideBin } from "yargs/helpers";

export const args = yargs(hideBin(process.argv))
  .option("svs3", {
    default: false,
    type: "boolean",
  })
  .positional("me", {
    coerce(arg: string) {
      return new Name(arg);
    },
    default: `/NDNts-${process.pid}-${Date.now()}`,
    type: "string",
  })
  .parseSync();

export const syncPrefix = new Name("/ndn/svs");
export const myDataPrefix = args.me.append(...syncPrefix.comps);

export async function openSvSync(wantHMAC: boolean): Promise<SvSync> {
  await openUplinks();

  const opts: SvSync.Options = {
    syncPrefix,
    svs3: args.svs3,
  };

  if (wantHMAC) {
    const key = await HMAC.cryptoGenerate({
      importRaw: Buffer.from("dGhpcyBpcyBhIHNlY3JldCBtZXNzYWdl", "base64"),
    }, false);
    opts.signer = createSigner(HMAC, key);
    opts.verifier = createVerifier(HMAC, key);
  }

  const sync = await SvSync.create(opts);
  exitClosers.push(sync);
  return sync;
}
