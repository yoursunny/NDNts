import { once } from "node:events";
import net from "node:net";
import path from "node:path";

import { Forwarder, type FwFace } from "@ndn/fw";
import { L3Face, type Transport } from "@ndn/l3face";
import { joinHostPort, splitHostPort, udp_helper, UdpTransport } from "@ndn/node-transport";
import type { NameLike } from "@ndn/packet";
import { gql, GraphQLClient } from "graphql-request";

import { Delete } from "./gql";
import { MemifTransport } from "./memif-transport";
import { NdndpdkPrefixReg } from "./prefix-reg";

const DefaultGqlServer = "http://127.0.0.1:3030";

async function detectLocalAddress(gqlServer: string): Promise<string> {
  const { host, port = 80 } = splitHostPort(new URL(gqlServer).host);
  if (host === "127.0.0.1") {
    return host;
  }

  const tcpConn = net.connect(port, host);
  await once(tcpConn, "connect");
  const { localAddress } = tcpConn;
  tcpConn.destroy();
  return localAddress!;
}

async function openFaceImpl(
    {
      gqlServer = DefaultGqlServer,
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
    await client.request<Delete.Resp, Delete.Vars>(Delete, { id });
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
  face.addEventListener("close", cleanup, { once: true });
  return face;
}

const openFaceScheme = {
  async udp(opts) {
    let {
      gqlServer = DefaultGqlServer,
      localHost,
      mtu = 1400,
      udp: udpOptionsInput,
    } = opts;
    localHost ??= await detectLocalAddress(gqlServer);
    const sockOpts = {
      bind: { address: localHost },
      ...udpOptionsInput,
    };
    const sock = await udp_helper.openSocket(sockOpts);
    try {
      return await openFaceImpl(opts,
        {
          scheme: "udp",
          remote: joinHostPort(localHost, sock.address().port),
          mtu,
        },
        async (loc) => {
          const { host, port } = splitHostPort((loc as { local?: string }).local ?? "");
          if (!host || !port) {
            throw new Error(`unexpected locator: ${JSON.stringify(loc)}`);
          }
          await udp_helper.connect(sock, { host, port });
          return [new UdpTransport(sock), mtu];
        });
    } catch (err: unknown) {
      sock.close();
      throw err;
    }
  },
  async memif(opts) {
    const { mtu = 2048 } = opts;
    const {
      memif: {
        socketPath = "/run/ndn",
        dataroom = mtu,
        ringCapacity = 1024,
      } = {},
    } = opts;
    const socketName = path.join(socketPath, `NDNts-memif-${process.pid}-${Date.now()}.sock`);
    const socketOwner = (process.getuid && process.getgid) ? [process.getuid(), process.getgid()] : undefined;
    return openFaceImpl(opts,
      {
        scheme: "memif",
        role: "server",
        socketName,
        socketOwner,
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
  },
} satisfies Record<string, (opts: openFace.Options) => Promise<FwFace>>;

/** Open a face on NDN-DPDK. */
export async function openFace(opts: openFace.Options = {}): Promise<FwFace> {
  const { scheme = "udp" } = opts;
  const face = await openFaceScheme[scheme]?.(opts);
  if (face === undefined) {
    throw new Error(`unknown scheme ${scheme}`);
  }
  return face;
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
    scheme?: keyof typeof openFaceScheme;

    /**
     * Face MTU.
     * If scheme is "udp", default is 1400.
     * If scheme is "memif", default is 2048, but ignored if .memif.dataroom is set.
     */
    mtu?: number;

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
