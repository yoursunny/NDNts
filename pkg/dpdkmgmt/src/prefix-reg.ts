import { ReadvertiseDestination } from "@ndn/fw";
import type { Name } from "@ndn/packet";
import type { GraphQLClient } from "graphql-request";

import { Delete, InsertFibEntry } from "./gql";

interface State {
  fibEntryID?: string;
}

/** Enable prefix registration via NDN-DPDK GraphQL management API. */
export class NdndpdkPrefixReg extends ReadvertiseDestination<State> {
  constructor(private readonly client: GraphQLClient, private readonly faceID: string) {
    super();
  }

  protected override async doAdvertise(name: Name, state: State) {
    const resp = await this.client.request<InsertFibEntry.Resp, InsertFibEntry.Vars>(
      InsertFibEntry,
      {
        name: name.toString(),
        nexthops: [this.faceID],
      },
    );
    state.fibEntryID = resp.insertFibEntry.id;
  }

  protected override async doWithdraw(name: Name, state: State) {
    void name;
    if (!state.fibEntryID) {
      return;
    }
    await this.client.request<Delete.Resp, Delete.Vars>(Delete, { id: state.fibEntryID });
    delete state.fibEntryID;
  }
}
