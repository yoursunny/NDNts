import { Forwarder } from "@ndn/fw";
import { L3Face, Transport } from "@ndn/l3face";
import { MockTransport } from "@ndn/l3face/test-fixture/mock-transport";
import { Name } from "@ndn/packet";
import * as dgram from "dgram";

import { joinHostPort } from "../src/hostport";
import * as udp from "../src/udp-helper";

class UdpServerTransport extends MockTransport {
  constructor(
      private readonly sock: dgram.Socket,
      public readonly address: string,
      public readonly port: number,
  ) {
    super();
  }

  public override send(pkt: Uint8Array): void {
    this.sock.send(pkt, this.port, this.address);
  }
}

export abstract class UdpServer {
  public static async create<T extends UdpServer>(ctor: new(sock: dgram.Socket, host: string, port: number) => T, family: udp.AddressFamily = 4, address = "127.0.0.1"): Promise<T> {
    const sock = dgram.createSocket({ type: `udp${family}` });
    sock.on("error", () => undefined);
    const port = await new Promise<number>((r) =>
      sock.bind({ address }, () => r(sock.address().port)));
    return new ctor(sock, address, port);
  }

  protected readonly transports = new Map<string, UdpServerTransport>();

  constructor(
      private readonly sock: dgram.Socket,
      private readonly address: string,
      public readonly port: number,
  ) {
    sock.on("message", this.handleMessage);
  }

  public get hostport(): string {
    return joinHostPort(this.address, this.port);
  }

  public close(): void {
    for (const transport of this.transports.values()) {
      transport.close();
    }
    this.sock.close();
  }

  public addClient(port: number, address = this.address): void {
    this.ensureTransport(address, port);
  }

  private ensureTransport(address: string, port: number): UdpServerTransport {
    const key = joinHostPort(address, port);
    let transport = this.transports.get(key);
    if (!transport) {
      transport = new UdpServerTransport(this.sock, address, port);
      this.transports.set(key, transport);
      this.handleNewTransport(transport);
    }
    return transport;
  }

  protected abstract handleNewTransport(transport: UdpServerTransport): void;

  private handleMessage = (pkt: Uint8Array, { address, port }: dgram.RemoteInfo): void => {
    const transport = this.ensureTransport(address, port);
    transport.recv(pkt);
  };
}

export class UdpServerBroadcast extends UdpServer {
  public broadcast(pkt: Uint8Array, except?: Transport): void {
    for (const transport of this.transports.values()) {
      if (transport === except) {
        continue;
      }
      transport.send(pkt);
    }
  }

  protected override handleNewTransport(transport: UdpServerTransport): void {
    void (async () => {
      for await (const pkt of transport.rx) {
        this.broadcast(pkt.tlv, transport);
      }
    })();
  }
}

export class UdpServerForwarder extends UdpServer {
  public readonly fw = Forwarder.create();

  protected override handleNewTransport(transport: UdpServerTransport): void {
    const face = this.fw.addFace(new L3Face(transport));
    face.addRoute(new Name());
  }
}
