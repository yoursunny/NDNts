import { ReadvertiseDestination } from "@ndn/fw";
import type { Name } from "@ndn/packet";
import { type GraphQLClient, type Variables, gql } from "graphql-request";

interface State {
  fibEntryID?: string;
}

interface InsertFibEntryVars extends Variables {
  name: string;
  nexthops: string[];
}

interface InsertFibEntryResp {
  insertFibEntry: {
    id: string;
  };
}

interface DeleteVars extends Variables {
  id: string;
}

interface DeleteResp {
  delete: boolean;
}

/** Enable prefix registration via NDN-DPDK GraphQL management API. */
export class NdndpdkPrefixReg extends ReadvertiseDestination<State> {
  constructor(private readonly client: GraphQLClient, private readonly faceID: string) {
    super();
  }

  protected override async doAdvertise(name: Name, state: State) {
    const resp = await this.client.request<InsertFibEntryResp, InsertFibEntryVars>(gql`
      mutation insertFibEntry($name: Name!, $nexthops: [ID!]!, $strategy: ID) {
        insertFibEntry(name: $name, nexthops: $nexthops, strategy: $strategy) {
          id
        }
      }
    `, {
      name: name.toString(),
      nexthops: [this.faceID],
    });
    state.fibEntryID = resp.insertFibEntry.id;
  }

  protected override async doWithdraw(name: Name, state: State) {
    void name;
    if (!state.fibEntryID) {
      return;
    }
    await this.client.request<DeleteResp, DeleteVars>(gql`
      mutation delete($id: ID!) {
        delete(id: $id)
      }
    `, {
      id: state.fibEntryID,
    });
    delete state.fibEntryID;
  }
}
