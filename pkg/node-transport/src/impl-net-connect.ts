import net from "node:net";

import { pEvent } from "p-event";

export async function connectAndWaitConnected(
    opts: net.NetConnectOpts & { connectTimeout?: number },
): Promise<net.Socket> {
  const sock = net.connect(opts);
  try {
    await pEvent(sock, "connect", { timeout: opts.connectTimeout ?? 10000 });
  } catch (err: unknown) {
    sock.destroy();
    throw err;
  }
  sock.on("error", () => undefined);
  return sock;
}
