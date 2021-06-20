import { connectToNetwork, connectToRouter } from "@ndn/autoconfig";
import { FwFace, FwTracer } from "@ndn/fw";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { UnixTransport } from "@ndn/node-transport";
import { Name } from "@ndn/packet";

import { env } from "./env";
import { getSignerImpl, openKeyChain } from "./keychain";

if (env.pkttrace) {
  FwTracer.enable();
}

async function makeFace(): Promise<FwFace> {
  let preferTcp = false;
  switch (env.uplink.protocol) {
    case "autoconfig-tcp:":
      preferTcp = true;
      // fallthrough
    case "autoconfig:": {
      try {
        const faces = await connectToNetwork({
          mtu: env.mtu,
          preferTcp,
          addRoutes: [],
        });
        return faces[0]!;
      } catch {
        throw new Error("autoconfig unavailable, set uplink in NDNTS_UPLINK");
      }
    }
    case "tcp:":
      return (await connectToRouter(env.uplink.host,
        { preferTcp: true, testConnection: false })).face;
    case "udp:":
      return (await connectToRouter(env.uplink.host,
        { preferTcp: false, mtu: env.mtu, testConnection: false })).face;
    case "unix:": {
      const face = await UnixTransport.createFace({}, env.uplink.pathname);
      face.addRoute(new Name("/"), false);
      return face;
    }
    default:
      throw new Error(`unknown protocol ${env.uplink.protocol} in NDNTS_UPLINK`);
  }
}

let theUplinks: FwFace[] | undefined;

/** Open the uplinks specified by NDNTS_UPLINK environ. */
export async function openUplinks(): Promise<FwFace[]> {
  if (!theUplinks) {
    const face = await makeFace();
    if (env.nfdreg) {
      const signerName = env.nfdregkey ?? env.key;
      const signer = await getSignerImpl(signerName);
      enableNfdPrefixReg(face, {
        signer,
        preloadCertName: signerName,
        preloadFromKeyChain: openKeyChain(),
      });
    }
    theUplinks = [face];
  }
  return theUplinks;
}

/** Close the uplinks. */
export function closeUplinks() {
  if (!theUplinks) {
    return;
  }
  for (const uplink of theUplinks) {
    uplink.close();
  }
  theUplinks = undefined;
}
