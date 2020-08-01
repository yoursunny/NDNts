import { connectToTestbed } from "@ndn/autoconfig";
import { FwFace, FwTracer } from "@ndn/fw";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { TcpTransport, UdpTransport, UnixTransport } from "@ndn/node-transport";
import { Name } from "@ndn/packet";

import { env } from "./env";
import { getSignerImpl } from "./keychain";

if (env.pkttrace) {
  FwTracer.enable();
}

function parseHostPort(): { host: string; port: number|undefined } {
  const { hostname, port } = env.uplink;
  return {
    host: hostname,
    port: port.length > 0 ? Number.parseInt(port, 10) : undefined,
  };
}

async function makeFace(): Promise<FwFace> {
  switch (env.uplink.protocol) {
    case "autoconfig:": {
      const faces = await connectToTestbed({ preferFastest: true });
      if (faces.length === 0) {
        throw new Error("autoconfig unavailable, set uplink in NDNTS_UPLINK");
      }
      return faces[0];
    }
    case "tcp:":
      return TcpTransport.createFace({}, parseHostPort());
    case "udp:":
      return UdpTransport.createFace({ lp: { mtu: env.mtu } }, parseHostPort());
    case "unix:":
      return UnixTransport.createFace({}, env.uplink.pathname);
    default:
      throw new Error(`unknown protocol ${env.uplink.protocol} in NDNTS_UPLINK`);
  }
}

let theUplinks: FwFace[]|undefined;

export async function openUplinks(): Promise<FwFace[]> {
  if (typeof theUplinks === "undefined") {
    const face = await makeFace();
    if (env.nfdreg) {
      // As of 2020-May, testbed rejects prefixreg command with cert name as KeyLocator.
      // https://github.com/WU-ARL/NDN_Ansible/issues/35
      // Thus, set useKeyNameKeyLocator = false.
      const signer = await getSignerImpl(env.nfdregkey ?? env.key, true);
      enableNfdPrefixReg(face, { signer });
    }
    face.addRoute(new Name("/"));
    theUplinks = [face];
  }
  return theUplinks;
}

export function closeUplinks() {
  if (typeof theUplinks !== "undefined") {
    theUplinks.forEach((uplink) => uplink.close());
    theUplinks = undefined;
  }
}
