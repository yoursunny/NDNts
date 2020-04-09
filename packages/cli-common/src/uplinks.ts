import { connectToTestbed } from "@ndn/autoconfig";
import { Forwarder, FwFace, FwTracer } from "@ndn/fw";
import { L3Face, Transport } from "@ndn/l3face";
import { enableNfdPrefixReg } from "@ndn/nfdmgmt";
import { TcpTransport, UdpTransport, UnixTransport } from "@ndn/node-transport";
import { Name } from "@ndn/packet";

import { env } from "./env";
import { getSignerImpl } from "./keychain";

if (env.pkttrace) {
  FwTracer.enable();
}

function connectTcpUdp(typ: typeof TcpTransport|typeof UdpTransport): Promise<Transport> {
  const { hostname, port } = env.uplink;
  const portNum = port.length > 0 ? parseInt(port, 10) : undefined;
  return typ.connect(hostname, portNum);
}

async function makeFace(): Promise<FwFace> {
  let transport: Transport;
  switch (env.uplink.protocol) {
    case "autoconfig:": {
      const faces = await connectToTestbed({ preferFastest: true });
      if (faces.length === 0) {
        throw new Error("autoconfig unavailable, set uplink in NDNTS_UPLINK");
      }
      return faces[0];
    }
    case "tcp:":
      transport = await connectTcpUdp(TcpTransport);
      break;
    case "udp:":
      transport = await connectTcpUdp(UdpTransport);
      break;
    case "unix:":
      transport = await UnixTransport.connect(env.uplink.pathname);
      break;
    default:
      throw new Error(`unknown protocol ${env.uplink.protocol} in NDNTS_UPLINK`);
  }

  return Forwarder.getDefault().addFace(new L3Face(transport));
}

let theUplinks: FwFace[]|undefined;

export async function openUplinks(): Promise<FwFace[]> {
  if (typeof theUplinks === "undefined") {
    const face = await makeFace();
    if (env.nfdreg) {
      const signer = await getSignerImpl(env.nfdregkey ?? env.key);
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
