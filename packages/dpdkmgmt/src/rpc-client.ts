import { TcpTransportClient } from "mole-rpc-transport-tcp";
// eslint-disable-next-line @typescript-eslint/prefer-ts-expect-error
// @ts-ignore
import MoleClient from "mole-rpc/MoleClient.js";

export class RpcClient {
  public static create(host = "127.0.0.1", port = 6345): RpcClient {
    const transport = new TcpTransportClient({
      host,
      port,
    });
    const client = new MoleClient({
      requestTimeout: 10000,
      transport,
    });
    return new RpcClient(transport, client);
  }

  private constructor(private readonly transport: TcpTransportClient, private readonly client: any) {}

  public async request(module: string, method: string, arg: unknown): Promise<unknown> {
    const params = { ...(arg as object) };
    Object.defineProperty(params, "length", { value: true });
    return this.client.callMethod(`${module}.${method}`, params);
  }

  public close() {
    this.transport.close();
  }
}
