import { Forwarder, FwFace } from "@ndn/fw";
import { L3Face, Transport } from "@ndn/l3face";
import { joinHostPort, splitHostPort, udp_helper, UdpTransport } from "@ndn/node-transport";
import { NameLike } from "@ndn/packet";
import { gql, GraphQLClient } from "graphql-request";
import * as net from "node:net";
import * as path from "node:path";
import pEvent from "p-event";

import { MemifTransport } from "./memif-transport";
import { NdndpdkPrefixReg } from "./prefix-reg";

const DefaultGqlServer = "http://127.0.0.1:3030";

async function detectLocalAddress(gqlServer: string): Promise<string> {
  const { host, port = 80 } = splitHostPort(new URL(gqlServer).host);
  if (host === "127.0.0.1") {
    return host;
  }

  const tcpConn = net.connect(port, host);
  await pEvent(tcpConn, "connect");
  const { localAddress } = tcpConn;
  tcpConn.destroy();
  return localAddress;
}

async function openFaceImpl(
    {
      gqlServer = "http://127.0.0.1:3030",
      fw = Forwarder.getDefault(),
      addRoutes,
      attributes = {},
    }: openFace.Options,
    locator: unknown,
    prepareTransport: (locator: unknown) => Promise<[transport: Transport, mtu: number]>,
): Promise<FwFace> {
  const client = new GraphQLClient(gqlServer);
  const { createFace: { id, locator: loc } } = await client.request<{
    createFace: {
      id: string;
      locator: unknown;
    };
  }>(gql`
    mutation createFace($locator: JSON!) {
      createFace(locator: $locator) {
        id
        locator
      }
    }
  `, {
    locator,
  });

  const prefixReg = new NdndpdkPrefixReg(client, id);
  const cleanup = async () => {
    prefixReg.disable();
    await client.request(gql`
      mutation delete($id: ID!) {
        delete(id: $id)
      }
    `, {
      id,
    });
  };

  let transport: Transport;
  let mtu: number;
  try {
    [transport, mtu] = await prepareTransport(loc);
  } catch (err: unknown) {
    await cleanup();
    throw err;
  }

  prefixReg.enable(fw);
  const face = fw.addFace(new L3Face(transport, {
    advertiseFrom: false,
    describe: `NDN-DPDK(${id})`,
    ...attributes,
  }, {
    mtu,
  }));
  L3Face.processAddRoutes(face, addRoutes);
  face.on("close", cleanup);
  return face;
}

async function openFaceUdp(opts: openFace.Options) {
  let {
    gqlServer = DefaultGqlServer,
    localHost,
    udp: udpOptionsInput,
  } = opts;
  localHost ??= await detectLocalAddress(gqlServer);
  const sock = await udp_helper.openSocket({
    bind: { address: localHost },
    ...udpOptionsInput,
  });
  try {
    return await openFaceImpl(opts,
      {
        scheme: "udp",
        remote: joinHostPort(localHost, sock.address().port),
      },
      async (loc) => {
        const { host, port } = splitHostPort((loc as { local?: string }).local ?? "");
        if (!host || !port) {
          throw new Error(`unexpected locator: ${JSON.stringify(loc)}`);
        }
        await udp_helper.connect(sock, { host, port });
        return [new UdpTransport(sock), 1450];
      });
  } catch (err: unknown) {
    sock.close();
    throw err;
  }
}

async function openFaceMemif(opts: openFace.Options) {
  const {
    memif: memifOptionsInput = {},
  } = opts;
  const {
    socketPath = "/run/ndn",
    dataroom = 2048,
    ringCapacity = 1024,
  } = memifOptionsInput;
  const socketName = path.join(socketPath, `NDNts-memif-${process.pid}-${Date.now()}.sock`);
  return openFaceImpl(opts,
    {
      scheme: "memif",
      role: "server",
      socketName,
      socketOwner: [process.getuid(), process.getgid()],
      id: 0,
      dataroom,
      ringCapacity,
    },
    async () => {
      const transport = await MemifTransport.connect({
        role: "client",
        socketName,
        id: 0,
        dataroom,
        ringCapacity,
      });
      return [transport, dataroom];
    });
}

/** Open a face on NDN-DPDK. */
export async function openFace(opts: openFace.Options = {}): Promise<FwFace> {
  const {
    scheme = "udp",
  } = opts;
  switch (scheme) {
    case "udp":
      return openFaceUdp(opts);
    case "memif":
      return openFaceMemif(opts);
    default:
      throw new Error(`unknown scheme ${scheme}`);
  }
}

export namespace openFace {
  export interface Options {
    /**
     * NDN-DPDK GraphQL server.
     * Default is http://127.0.0.1:3030 .
     */
    gqlServer?: string;
    /**
     * IP address to reach local host from NDN-DPDK.
     * Default is auto-detected from GraphQL HTTP client.
     */
    localHost?: string;

    /** NDNts logical forwarder. */
    fw?: Forwarder;
    /** NDNts face attributes. */
    attributes?: L3Face.Attributes;
    /** Routes to be added on the created face. Default is ["/"]. */
    addRoutes?: readonly NameLike[];

    /**
     * Transport scheme.
     * Default is "udp".
     */
    scheme?: "udp" | "memif";

    /** UDP socket options. */
    udp?: udp_helper.OpenSocketOptions;
    /** memif options. */
    memif?: MemifOptions;
  }

  /** memif options. */
  export interface MemifOptions extends Pick<MemifTransport.Options, "dataroom" | "ringCapacity"> {
    /**
     * Directory in which to place control socket.
     * If NDN-DPDK and NDNts are in containers, the same directory must be mounted in both containers.
     * Default is /run/ndn .
     */
    socketPath?: string;
  }
}
