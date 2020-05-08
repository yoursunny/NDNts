import { Forwarder, FwFace } from "@ndn/fw";
import { UdpTransport } from "@ndn/node-transport";
import * as dgram from "dgram";

import { L3Face } from "@ndn/l3face";
import { NdndpdkPrefixReg } from "./prefix-reg";
import { RpcClient } from "./rpc-client";

export interface CreateFaceOptions {
  /** NDNts forwarder. */
  fw?: Forwarder;
  /** NDNts face attributes. */
  attributes?: L3Face.Attributes,

  /** Local IP address. */
  localHost?: string;
  /** NDN-DPDK IP address. */
  host?: string;
  /** NDN-DPDK management port. */
  port?: number;
}

export async function createFace({
  fw = Forwarder.getDefault(),
  attributes = {},
  localHost = "127.0.0.1",
  host = "127.0.0.1",
  port = 6345,
}: CreateFaceOptions = {}): Promise<FwFace> {
  const sock = await new Promise<dgram.Socket>((resolve, reject) => {
    const sock = dgram.createSocket({ type: "udp4" });
    sock.on("error", reject);
    sock.bind(0, localHost, () => {
      sock.off("error", reject);
      resolve(sock);
    });
  });

  const rpc = RpcClient.create(host, port);
  let faceId: number;
  let remoteAddr: string;
  try {
    const result = await rpc.request("Face", "Create", {
      Scheme: "udp",
      Remote: `${localHost}:${sock.address().port}`,
    } as SocketFaceLocator) as FaceBasicInfo;
    faceId = result.Id;
    remoteAddr = result.Locator.Local!;
  } catch (err) {
    rpc.close();
    throw err;
  }

  const prefixReg = new NdndpdkPrefixReg(rpc, faceId);
  sock.on("close", async () => {
    try {
      prefixReg.disable();
      await rpc.request("Face", "Destroy", { Id: faceId } as IdArg);
    } catch {
    } finally {
      rpc.close();
    }
  });

  await new Promise((resolve, reject) => {
    const [remoteHost, remotePort] = remoteAddr.split(":");
    sock.on("error", () => {
      sock.close();
      reject();
    });
    sock.connect(Number.parseInt(remotePort, 10), remoteHost, () => {
      sock.off("error", reject);
      resolve();
    });
  });

  const transport = new UdpTransport(sock);
  prefixReg.enable(fw);
  return fw.addFace(new L3Face(transport, {
    advertiseFrom: false,
    describe: `NDN-DPDK(${host}#${faceId})`,
    ...attributes,
  }));
}

interface SocketFaceLocator {
  Scheme: "udp"|"tcp";
  Local?: string;
  Remote: string;
}

interface IdArg {
  Id: number;
}

interface FaceBasicInfo extends IdArg {
  Locator: SocketFaceLocator;
}
