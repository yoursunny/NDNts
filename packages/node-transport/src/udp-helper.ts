import * as dgram from "dgram";
import * as os from "os";
import pEvent from "p-event";

const DEFAULT_UNICAST_PORT = 6363;
const DEFAULT_MULTICAST_GROUP = "224.0.23.170";
const DEFAULT_MULTICAST_PORT = 56363;

export type Socket = dgram.Socket;

export interface SocketBufferOption {
  recvBufferSize?: number;
  sendBufferSize?: number;
}

export type AddressFamily = 4 | 6;

export interface AddressFamilyOption {
  /**
   * IPv4 or IPv6.
   * Default is IPv4, unless hostname is an IPv6 address (contains a colon).
   */
  family?: AddressFamily;
}

export interface OpenSocketOptions extends SocketBufferOption, AddressFamilyOption {
  /** Bind options, such as local address and port. */
  bind?: dgram.BindOptions;
}

export async function openSocket({
  family,
  recvBufferSize,
  sendBufferSize,
  bind = {},
}: OpenSocketOptions): Promise<Socket> {
  family ??= bind.address?.includes(":") ? 6 : 4;
  const sock = dgram.createSocket({
    type: `udp${family}`,
    reuseAddr: true,
    recvBufferSize,
    sendBufferSize,
  });
  try {
    sock.bind(bind);
    await pEvent(sock, "listening");
  } catch (err: unknown) {
    sock.close();
    throw err;
  }
  return sock;
}

export interface ConnectOptions {
  /** Remote address. */
  host: string;
  /** Remote port. */
  port?: number;
}

export async function connect(sock: Socket, {
  host,
  port = DEFAULT_UNICAST_PORT,
}: ConnectOptions): Promise<Socket> {
  try {
    sock.connect(port, host);
    await pEvent(sock, "connect");
  } catch (err: unknown) {
    sock.close();
    throw err;
  }
  return sock;
}

export interface UnicastOptions extends OpenSocketOptions, ConnectOptions {}

export async function openUnicast(opts: UnicastOptions): Promise<Socket> {
  if (!opts.family && opts.host.includes(":")) {
    opts.family = 6;
  }
  const sock = await openSocket(opts);
  return connect(sock, opts);
}

export function listMulticastIntfs(): string[] {
  return Object.values(os.networkInterfaces())
    .flatMap((addrs) => {
      if (!addrs) {
        return [];
      }
      return addrs.filter(({ family, internal }) => family === "IPv4" && !internal)
        .map(({ address }) => address).slice(0, 1);
    });
}

export interface MulticastOptions extends SocketBufferOption {
  /** IPv4 address of local network interface. */
  intf: string;
  /** Multicast group address. */
  group?: string;
  /** Local and group port. */
  port?: number;
  /** Multicast TTL (for unit testing). */
  multicastTtl?: number;
  /** MulticastLoopback flag (for unit testing). */
  multicastLoopback?: boolean;
}

export async function openMulticastRx(opts: MulticastOptions): Promise<Socket> {
  const {
    intf,
    group = DEFAULT_MULTICAST_GROUP,
    port = DEFAULT_MULTICAST_PORT,
    multicastLoopback = false,
  } = opts;
  const sock = await openSocket({
    ...opts,
    bind: { port },
  });
  try {
    sock.setBroadcast(true);
    sock.setMulticastLoopback(multicastLoopback);
    sock.addMembership(group, intf);
  } catch (err: unknown) {
    sock.close();
    throw err;
  }
  return sock;
}

export async function openMulticastTx(opts: MulticastOptions): Promise<Socket> {
  const {
    intf,
    group = DEFAULT_MULTICAST_GROUP,
    port = DEFAULT_MULTICAST_PORT,
    multicastTtl = 1,
  } = opts;
  const sock = await openSocket({
    ...opts,
    bind: { address: intf, port },
  });
  try {
    sock.setMulticastTTL(multicastTtl);
    sock.setMulticastInterface(intf);
    sock.connect(port, group);
    await pEvent(sock, "connect");
  } catch (err: unknown) {
    sock.close();
    throw err;
  }
  return sock;
}
