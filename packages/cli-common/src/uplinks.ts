import { connectToNetwork, connectToRouter } from "@ndn/autoconfig";
import { openFace as dpdkOpenFace } from "@ndn/dpdkmgmt";
import { type FwFace, FwTracer } from "@ndn/fw";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { UnixTransport } from "@ndn/node-transport";
import { Closers } from "@ndn/util";

import { env } from "./env";
import { exitClosers } from "./exit";
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
      return [face, false];
    }
    default:
      throw new Error(`unknown protocol ${env.uplink.protocol} in NDNTS_UPLINK`);
  }
}

let theUplinks: Closers<FwFace> | undefined;

/** Open the uplinks specified by NDNTS_UPLINK environ. */
export async function openUplinks({ autoClose = true }: openUplinks.Options = {}): Promise<FwFace[]> {
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
    theUplinks = new Closers();
    theUplinks.push(face);
    if (autoClose) {
      exitClosers.push(theUplinks);
    }
  }
  return theUplinks;
}
export namespace openUplinks {
  export interface Options {
    /**
     * Whether to automatically close uplinks at exit.
     * Default is true.
     */
    autoClose?: boolean;
  }
}

/** Close the uplinks. */
export function closeUplinks() {
  theUplinks?.close();
  theUplinks = undefined;
}
