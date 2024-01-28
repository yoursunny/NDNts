import dgram from "node:dgram";
import { once } from "node:events";
import os from "node:os";

export const DEFAULT_MTU = 65000;
const DEFAULT_UNICAST_PORT = 6363;
const DEFAULT_MULTICAST_GROUP = "224.0.23.170";
const DEFAULT_MULTICAST_PORT = 56363;

export type Socket = dgram.Socket;

export type SocketBufferOptions = Pick<dgram.SocketOptions, "recvBufferSize" | "sendBufferSize">;

export type AddressFamily = 4 | 6;

export interface OpenSocketOptions extends SocketBufferOptions {
  /**
   * IPv4 or IPv6.
   * Default is IPv4, unless hostname is an IPv6 address (contains a colon).
   */
  family?: AddressFamily;

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
    await once(sock, "listening");
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
    await once(sock, "connect");
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

/**
 * List network interfaces capable of IPv4 multicast.
 * @returns IPv4 address of each network interface.
 */
export function listMulticastIntfs(): string[] {
  return Object.values(os.networkInterfaces()).flatMap((addrs = []) => {
    for (const addr of addrs) {
      if (addr.family === "IPv4" && !addr.internal) {
        return addr.address;
      }
    }
    return [];
  });
}

export interface MulticastOptions extends SocketBufferOptions {
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
    await once(sock, "connect");
  } catch (err: unknown) {
    sock.close();
    throw err;
  }
  return sock;
}
