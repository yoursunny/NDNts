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
      } catch {
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
  sock.once("end", close);
  sock.once("close", close);
}

function createServer(listen: (done: () => void) => void): Promise<void> {
  server = net.createServer(handleNewClient);
  server.on("error", () => undefined);
  return new Promise((resolve) => {
    listen(resolve);
  });
}

export function createTcpServer(): Promise<void> {
  return createServer((done) => {
    server.listen(() => {
      ({ port: tcpPort } = server.address() as net.AddressInfo);
      done();
    });
  });
}

export function createIpcServer(): Promise<void> {
  ipcPath = process.platform === "win32" ?
    `//./pipe/2a8370be-8abc-448f-bb09-54d8b243cf7a/${Math.floor(Math.random() * 0xFFFFFFFF)}` :
    tmpNameSync();
  return createServer((done) => server.listen(ipcPath, done));
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
