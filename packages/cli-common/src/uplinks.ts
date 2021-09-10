import { connectToNetwork, connectToRouter } from "@ndn/autoconfig";
import { openFace as dpdkOpenFace } from "@ndn/dpdkmgmt";
import { FwFace, FwTracer } from "@ndn/fw";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { UnixTransport } from "@ndn/node-transport";
import { Name } from "@ndn/packet";

import { env } from "./env";
import { getSignerImpl, openKeyChain } from "./keychain";

if (env.pktTrace) {
  FwTracer.enable();
}

async function makeFace(): Promise<[face: FwFace, nfd: boolean]> {
  let autoconfigPreferTcp = false;
  let dpdkScheme: dpdkOpenFace.Options["scheme"] = "udp";
  switch (env.uplink.protocol) {
    case "autoconfig-tcp:":
      autoconfigPreferTcp = true;
      // fallthrough
    case "autoconfig:": {
      try {
        const faces = await connectToNetwork({
          mtu: env.mtu,
          preferTcp: autoconfigPreferTcp,
          addRoutes: [],
        });
        return [faces[0]!, true];
      } catch {
        throw new Error("autoconfig unavailable, set uplink in NDNTS_UPLINK");
      }
    }
    case "tcp:":
      return [(await connectToRouter(env.uplink.host,
        { preferTcp: true, testConnection: false })).face, true];
    case "udp:":
      return [(await connectToRouter(env.uplink.host,
        { preferTcp: false, mtu: env.mtu, testConnection: false })).face, true];
    case "unix:": {
      const face = await UnixTransport.createFace({}, env.uplink.pathname);
      face.addRoute(new Name("/"), false);
      return [face, true];
    }
    case "ndndpdk-memif:":
      dpdkScheme = "memif";
      // fallthrough
    case "ndndpdk-udp:":
    case "ndndpdk:": {
      const face = await dpdkOpenFace({
        gqlServer: env.dpdkGql,
        localHost: env.dpdkLocal,
        scheme: dpdkScheme,
        memif: {
          socketPath: env.dpdkMemifSocketPath,
          dataroom: env.mtu,
        },
      });
      face.addRoute(new Name("/"), false);
      return [face, false];
    }
    default:
      throw new Error(`unknown protocol ${env.uplink.protocol} in NDNTS_UPLINK`);
  }
}

let theUplinks: FwFace[] | undefined;

/** Open the uplinks specified by NDNTS_UPLINK environ. */
export async function openUplinks(): Promise<FwFace[]> {
  if (!theUplinks) {
    const [face, nfd] = await makeFace();
    if (nfd && env.nfdReg) {
      const signerName = env.nfdRegKey ?? env.key;
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

process.once("SIGINT", closeUplinks);
