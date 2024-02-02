import fs from "node:fs/promises";
import path from "node:path";

import { connectToNetwork, connectToRouter } from "@ndn/autoconfig";
import { openFace as dpdkOpenFace } from "@ndn/dpdkmgmt";
import { type FwFace, FwTracer } from "@ndn/fw";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { UnixTransport } from "@ndn/node-transport";
import { Closers } from "@ndn/util";

import * as env from "./env";
import { exitClosers } from "./exit";
import { getSignerImpl, openKeyChain } from "./keychain";

if (env.pktTrace) {
  FwTracer.enable();
}

async function checkUnixSocket(pathname: string): Promise<boolean> {
  try {
    return path.isAbsolute(pathname) && (await fs.stat(pathname)).isSocket();
  } catch {
    return false;
  }
}

async function makeFace(): Promise<[face: FwFace, nfd: boolean]> {
  let autoconfigPreferTcp = false;
  let dpdkScheme: dpdkOpenFace.Options["scheme"] = "udp";
  switch (env.uplink.protocol) {
    case "autoconfig-tcp:": {
      autoconfigPreferTcp = true;
    }
    // fallthrough
    case "autoconfig:": {
      try {
        const faces = await connectToNetwork({
          mtu: env.mtu,
          preferTcp: autoconfigPreferTcp,
        });
        return [faces[0]!, true];
      } catch (err: unknown) {
        throw new Error(`autoconfig failed: ${err}\nset uplink in NDNTS_UPLINK`, { cause: err });
      }
    }
    case "tcp:": {
      return [(await connectToRouter(env.uplink.host,
        { preferTcp: true, testConnection: false })).face, true];
    }
    case "udp:": {
      return [(await connectToRouter(env.uplink.host,
        { preferTcp: false, mtu: env.mtu, testConnection: false })).face, true];
    }
    case "unix:": {
      let { pathname } = env.uplink;
      const fallbacks = env.uplink.searchParams.getAll("fallback");
      if (fallbacks.length > 0 && !(await checkUnixSocket(pathname))) {
        for (const fallback of fallbacks) {
          if (await checkUnixSocket(fallback)) {
            pathname = fallback;
            break;
          }
        }
      }
      const face = await UnixTransport.createFace({}, pathname);
      return [face, true];
    }
    case "ndndpdk-memif:": {
      dpdkScheme = "memif";
    }
    // fallthrough
    case "ndndpdk-udp:":
    case "ndndpdk:": {
      const face = await dpdkOpenFace({
        gqlServer: env.dpdkGql,
        localHost: env.dpdkLocal,
        scheme: dpdkScheme,
        mtu: env.mtu,
        memif: {
          socketPath: env.dpdkMemifSocketPath,
        },
      });
      return [face, false];
    }
    default: {
      throw new Error(`unknown protocol ${env.uplink.protocol} in NDNTS_UPLINK`);
    }
  }
}

let theUplinks: (Closers & FwFace[]) | undefined;

/** Open the uplinks specified by `NDNTS_UPLINK` environ. */
export async function openUplinks({ autoClose = true }: openUplinks.Options = {}): Promise<FwFace[]> {
  if (!theUplinks) {
    const [face, nfd] = await makeFace();
    if (nfd && env.nfdReg) {
      const [signer, klName] = await getSignerImpl(env.nfdRegKey);
      enableNfdPrefixReg(face, {
        signer,
        preloadCertName: klName ?? env.nfdRegKey,
        preloadFromKeyChain: openKeyChain(),
      });
    }
    theUplinks = new Closers() as (Closers & FwFace[]);
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
     * @defaultValue true
     */
    autoClose?: boolean;
  }
}

/** Close the uplinks. */
export function closeUplinks() {
  theUplinks?.close();
  theUplinks = undefined;
}
