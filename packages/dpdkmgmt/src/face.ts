import { Forwarder, FwFace } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { UdpTransport } from "@ndn/node-transport";
import * as dgram from "dgram";
import { gql, GraphQLClient } from "graphql-request";

import { NdndpdkPrefixReg } from "./prefix-reg";

export interface OpenFaceOptions {
  /** NDNts forwarder. */
  fw?: Forwarder;
  /** NDNts face attributes. */
  attributes?: L3Face.Attributes;

  /** Local IP address. */
  localHost?: string;
  /** NDN-DPDK GraphQL server. */
  gqlServer?: string;
}

/** Open a face on NDN-DPDK. */
export async function openFace({
  fw = Forwarder.getDefault(),
  attributes = {},
  localHost = "127.0.0.1",
  gqlServer = "http://localhost:3030",
}: OpenFaceOptions = {}): Promise<FwFace> {
  const sock = await new Promise<dgram.Socket>((resolve, reject) => {
    const sock = dgram.createSocket({ type: "udp4" });
    sock.on("error", reject);
    sock.bind(0, localHost, () => {
      sock.off("error", reject);
      resolve(sock);
    });
  });

  const client = new GraphQLClient(gqlServer);
  const { createFace: { id, locator: { local: remoteAddr } } } = await client.request(gql`
    mutation createFace($locator: JSON!) {
      createFace(locator: $locator) {
        id
        locator
      }
    }
  `, {
    locator: {
      scheme: "udp",
      remote: `${localHost}:${sock.address().port}`,
    },
  });

  const prefixReg = new NdndpdkPrefixReg(client, id);
  sock.on("close", async () => {
    prefixReg.disable();
    await client.request(gql`
      mutation delete($id: ID!) {
        delete(id: $id)
      }
    `, {
      id,
    });
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
    describe: `NDN-DPDK(${id})`,
    ...attributes,
  }));
}
