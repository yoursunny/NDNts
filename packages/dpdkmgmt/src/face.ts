import { Forwarder, FwFace } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { joinHostPort, splitHostPort, udp_helper, UdpTransport } from "@ndn/node-transport";
import { gql, GraphQLClient } from "graphql-request";
import * as net from "net";
import pEvent from "p-event";

import { NdndpdkPrefixReg } from "./prefix-reg";

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

/** Open a face on NDN-DPDK. */
export async function openFace({
  gqlServer = "http://localhost:3030",
  fw = Forwarder.getDefault(),
  attributes = {},
  localHost,
  udp: udpOptionsInput,
}: openFace.Options = {}): Promise<FwFace> {
  if (!localHost) {
    localHost = await detectLocalAddress(gqlServer);
  }

  const sock = await udp_helper.openSocket({
    bind: { address: localHost },
    ...udpOptionsInput,
  });

  const client = new GraphQLClient(gqlServer);
  const { createFace: { id, locator } } = await client.request<{
    createFace: {
      id: string;
      locator: {
        local?: string;
      };
    };
  }>(gql`
    mutation createFace($locator: JSON!) {
      createFace(locator: $locator) {
        id
        locator
      }
    }
  `, {
    locator: {
      scheme: "udp",
      remote: joinHostPort(localHost, sock.address().port),
    },
  });

  const prefixReg = new NdndpdkPrefixReg(client, id);
  sock.once("close", async () => {
    prefixReg.disable();
    await client.request(gql`
      mutation delete($id: ID!) {
        delete(id: $id)
      }
    `, {
      id,
    });
  });

  const { host, port } = splitHostPort(locator.local ?? "");
  if (!host || !port) {
    throw new Error(`unexpected locator: ${JSON.stringify(locator)}`);
  }
  await udp_helper.connect(sock, { host, port });

  const transport = new UdpTransport(sock);
  prefixReg.enable(fw);
  return fw.addFace(new L3Face(transport, {
    advertiseFrom: false,
    describe: `NDN-DPDK(${id})`,
    ...attributes,
  }));
}

export namespace openFace {
  export interface Options {
    /** NDN-DPDK GraphQL server. */
    gqlServer?: string;

    /** NDNts logical forwarder. */
    fw?: Forwarder;
    /** NDNts face attributes. */
    attributes?: L3Face.Attributes;

    /**
     * IP address to reach local host from NDN-DPDK.
     * Default is auto-detected from GraphQL HTTP client.
     */
    localHost?: string;

    /** UDP socket options. */
    udp?: udp_helper.OpenSocketOptions;
  }
}
