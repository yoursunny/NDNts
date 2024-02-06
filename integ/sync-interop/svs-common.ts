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
  const sync = await SvSync.create({
    syncPrefix,
    signer: createSigner(HMAC, key),
    verifier: createVerifier(HMAC, key),
  });
  exitClosers.push(sync);
  return sync;
}
