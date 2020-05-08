import { ReadvertiseDestination } from "@ndn/fw";
import { Name } from "@ndn/packet";

import { RpcClient } from "./rpc-client";

export class NdndpdkPrefixReg extends ReadvertiseDestination {
  constructor(private readonly rpc: RpcClient, private readonly faceId: number) {
    super();
  }

  protected async doAdvertise(name: Name) {
    await this.rpc.request("Fib", "Insert", {
      Name: name.toString(),
      Nexthops: [this.faceId],
    } as FibInsertArg);
  }

  protected async doWithdraw(name: Name) {
    await this.rpc.request("Fib", "Erase", {
      Name: name.toString(),
    } as NameArg);
  }
}

interface NameArg {
  Name: string;
}

interface FibInsertArg extends NameArg {
  Nexthops: number[];
}
