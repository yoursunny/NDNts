import { exitClosers, openUplinks } from "@ndn/cli-common";
import { createSigner, createVerifier, HMAC } from "@ndn/keychain";
import { Name } from "@ndn/packet";
import { SvSync } from "@ndn/svs";

export const syncPrefix = new Name("/ndn/svs");
export const myID = new Name(`/${process.pid}-${Date.now()}`);
export const myDataPrefix = myID.append(...syncPrefix.comps);

export async function openSvSync(): Promise<SvSync> {
  await openUplinks();

  const key = await HMAC.cryptoGenerate({
    importRaw: Buffer.from("dGhpcyBpcyBhIHNlY3JldCBtZXNzYWdl", "base64"),
  }, false);
  const opts: SvSync.Options = {
    syncPrefix,
    signer: createSigner(HMAC, key),
    verifier: createVerifier(HMAC, key),
  };

  if (process.env.NDNTS_INTEROP_SVS2) {
    opts.svs2interest = true;
    opts.svs2suppression = true;
  }

  const sync = await SvSync.create(opts);
  exitClosers.push(sync);
  return sync;
}
