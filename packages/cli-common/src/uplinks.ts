import { connect, connectToTestbed } from "@ndn/autoconfig";
import { FwFace, FwTracer } from "@ndn/fw";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { TcpTransport, UdpTransport, UnixTransport } from "@ndn/node-transport";
import { Name } from "@ndn/packet";

import { env } from "./env";
import { getSignerImpl, openKeyChain } from "./keychain";

if (env.pkttrace) {
  FwTracer.enable();
}

function parseHostPort(): { host: string; port: number|undefined } {
  const { hostname, port } = env.uplink;
  return {
    host: hostname.replace(/^\[|]$/g, ""),
    port: port.length > 0 ? Number.parseInt(port, 10) : undefined,
  };
}

async function makeFace(): Promise<FwFace> {
  let preferProtocol: connect.PreferProtocol|undefined;
  switch (env.uplink.protocol) {
    case "autoconfig-tcp:":
      preferProtocol = "tcp";
      // fallthrough
    case "autoconfig:": {
      try {
        const faces = await connectToTestbed({
          preferProtocol,
          mtu: env.mtu,
          count: 4,
          preferFastest: true,
          addRoutes: [],
        });
        return faces[0]!;
      } catch {
        throw new Error("autoconfig unavailable, set uplink in NDNTS_UPLINK");
      }
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

/** Open the uplinks specified by NDNTS_UPLINK environ. */
export async function openUplinks(): Promise<FwFace[]> {
  if (typeof theUplinks === "undefined") {
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
    face.addRoute(new Name("/"));
    theUplinks = [face];
  }
  return theUplinks;
}

/** Close the uplinks. */
export function closeUplinks() {
  if (typeof theUplinks !== "undefined") {
    for (const uplink of theUplinks) {
      uplink.close();
    }
    theUplinks = undefined;
  }
}
