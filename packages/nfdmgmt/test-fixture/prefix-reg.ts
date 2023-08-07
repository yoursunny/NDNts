import type * as net from "node:net";

import { Endpoint, type Producer } from "@ndn/endpoint";
import { Forwarder, type FwFace, TapFace } from "@ndn/fw";
import { L3Face, StreamTransport } from "@ndn/l3face";
import { TcpServer } from "@ndn/node-transport/test-fixture/net-server";
import { Data, type Interest } from "@ndn/packet";
import { Decoder, Encoder } from "@ndn/tlv";

import { ControlParameters, ControlResponse } from "..";

/** React to NFD prefix registration commands on a FwFace. */
export class PrefixRegServer {
  constructor(private readonly face: FwFace, private readonly faceId = 1) {
    this.tap = TapFace.create(face);
    this.mgmt = new Endpoint({ fw: this.tap.fw }).produce("/localhost/nfd/rib", this.handleCommand);
  }

  private readonly tap: FwFace;
  private readonly mgmt: Producer;

  public close(): void {
    this.mgmt.close();
    this.tap.close();
  }

  private readonly handleCommand = async (interest: Interest) => {
    const verb = interest.name.at(3).text;
    const params = Decoder.decode(interest.name.at(4).value, ControlParameters);

    switch (verb) {
      case "register": {
        this.face.addRoute(params.name!, false);
        break;
      }
      case "unregister": {
        this.face.removeRoute(params.name!, false);
        break;
      }
    }

    params.faceId ??= this.faceId;
    params.origin ??= 0;
    params.cost ??= 0;
    params.flags ??= 0x01;
    const cr = new ControlResponse(200, "", params);
    return new Data(interest.name, Encoder.encode(cr));
  };
}

/** TCP server that accepts NFD prefix registration commands. */
export class FakeNfd extends TcpServer {
  public readonly fw = Forwarder.create();

  public override close() {
    this.fw.close();
    return super.close();
  }

  /** Wait until at least n clients are connected, and enable PrefixRegServer on them. */
  public readonly waitNFaces = async (n: number): Promise<FakeNfd.Face[]> => {
    const socks = await this.waitNClients(n);
    return socks.map((sock) => {
      const tr = new StreamTransport(sock);
      const face = this.fw.addFace(new L3Face(tr));
      const reg = new PrefixRegServer(face);
      return {
        sock,
        face,
        reg,
      };
    });
  };
}
export namespace FakeNfd {
  export interface Face {
    sock: net.Socket;
    face: FwFace;
    reg: PrefixRegServer;
  }
}
