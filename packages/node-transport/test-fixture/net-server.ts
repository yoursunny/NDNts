import * as net from "net";
import { pipeline } from "readable-stream";
import { tmpNameSync } from "tmp";

import { BufferBreaker } from "./buffer-breaker";

export let server: net.Server;
export let tcpPort: number;
export let ipcPath: string;

let sendToClients = false;
const clients = new Set<net.Socket>();

function handleNewClient(sock: net.Socket) {
  clients.add(sock);
  let interval: NodeJS.Timeout|undefined;
  if (sendToClients) {
    interval = setInterval(() => {
      try {
        sock.write(Uint8Array.of(0x64, 0x00)); // NDNLPv2 IDLE packet
      } catch (err) {
        sock.destroy();
      }
    }, 10);
  }
  const close = () => {
    if (interval) { clearInterval(interval); }
    sock.destroy();
    clients.delete(sock);
  };
  sock.on("error", close);
  sock.once("close", close);
}

export function createTcpServer(): Promise<number> {
  server = net.createServer(handleNewClient);
  return new Promise<number>((resolve) => {
    server.listen(() => {
      ({ port: tcpPort } = server.address() as net.AddressInfo);
      resolve(tcpPort);
    });
  });
}

function makeIpcPath() {
  if (process.platform === "win32") {
    return `//./pipe/2a8370be-8abc-448f-bb09-54d8b243cf7a/${Math.floor(Math.random() * 0xFFFFFFFF)}`;
  }
  return tmpNameSync();
}

export function createIpcServer(): Promise<string> {
  ipcPath = makeIpcPath();
  server = net.createServer(handleNewClient);
  return new Promise<string>((resolve) => {
    server.listen(ipcPath, () => resolve(ipcPath));
  });
}

export async function destroyServer(): Promise<void> {
  await new Promise((r) => server.close(r));
  // Unix socket file will be unlinked by server.close() automatically
}

export async function waitNClients(n: number): Promise<net.Socket[]> {
  while (clients.size < n) {
    await new Promise((r) => server.once("connection", r));
  }
  return Array.from(clients);
}

export function enableSendToClients() {
  sendToClients = true;
}

export function enableDuplex(sockA: net.Socket, sockB: net.Socket) {
  pipeline(sockA, new BufferBreaker(), sockB, new BufferBreaker(), sockA, () => undefined);
}
