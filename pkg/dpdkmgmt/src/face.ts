import { once } from "node:events";
import net from "node:net";
import path from "node:path";

import { Forwarder, type FwFace } from "@ndn/fw";
import { L3Face, type Transport } from "@ndn/l3face";
import { joinHostPort, splitHostPort, udp_helper, UdpTransport } from "@ndn/node-transport";
import type { NameLike } from "@ndn/packet";
import { GraphQLClient } from "graphql-request";

import { CreateFace, Delete } from "./gql";
import { MemifTransport } from "./memif-transport";
import { NdndpdkPrefixReg } from "./prefix-reg";

const DefaultGqlServer = "http://127.0.0.1:3030";

async function detectLocalAddress(gqlServer: string): Promise<string> {
  const { host, port = 80 } = splitHostPort(new URL(gqlServer).host);
  if (host === "127.0.0.1") {
    return host;
  }

  const tcpConn = net.connect(port, host);
  try {
    await once(tcpConn, "connect");
    const { localAddress } = tcpConn;
    return localAddress!;
  } finally {
    tcpConn.destroy();
  }
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
  const resp = await client.request<CreateFace.Resp, CreateFace.Vars>(
    CreateFace,
    {
      locator,
    },
  );
  const { id, locator: loc } = resp.createFace;

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

async function openFaceUdp(opts: openFace.Options): Promise<FwFace> {
  const {
    gqlServer = DefaultGqlServer,
    localHost = await detectLocalAddress(gqlServer),
    mtu = 1400,
    udp: udpOptionsInput,
  } = opts;

  const sockOpts = {
    bind: { address: localHost },
    ...udpOptionsInput,
  };
  const sock = await udp_helper.openSocket(sockOpts);

  try {
    return await openFaceImpl(
      opts,
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
        return [await UdpTransport.connect(sock), mtu];
      },
    );
  } catch (err: unknown) {
    sock.close();
    throw err;
  }
}

async function openFaceMemif(opts: openFace.Options): Promise<FwFace> {
  const {
    mtu = 2048,
    memif: {
      socketPath = "/run/ndn",
      dataroom = mtu,
      ringCapacity = 1024,
    } = {},
  } = opts;

  const socketName = path.join(socketPath, `NDNts-memif-${process.pid}-${Date.now()}.sock`);
  const socketOwner = (process.getuid && process.getgid) ? [process.getuid(), process.getgid()] : undefined;

  return openFaceImpl(
    opts,
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
    },
  );
}

const openFaceScheme = {
  udp: openFaceUdp,
  memif: openFaceMemif,
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
     * @defaultValue http://127.0.0.1:3030
     */
    gqlServer?: string;

    /**
     * IP address to reach local host from NDN-DPDK.
     * @defaultValue
     * Auto-detected from GraphQL HTTP client.
     */
    localHost?: string;

    /**
     * NDNts logical forwarder.
     * @defaultValue `Forwarder.getDefault()`
     */
    fw?: Forwarder;

    /** NDNts face attributes. */
    attributes?: L3Face.Attributes;

    /**
     * Routes to be added on the created face.
     * @defaultValue `["/"]`
     */
    addRoutes?: readonly NameLike[];

    /**
     * Transport scheme.
     * @defaultValue "udp"
     */
    scheme?: keyof typeof openFaceScheme;

    /**
     * Face MTU.
     * @defaultValue
     * - For UDP, 1400.
     * - For memif, `.memif.dataroom` or 2048.
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
     * @defaultValue /run/ndn
     */
    socketPath?: string;
  }
}
