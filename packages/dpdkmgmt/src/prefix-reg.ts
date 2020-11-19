import { ReadvertiseDestination } from "@ndn/fw";
import type { Name } from "@ndn/packet";
import { gql, GraphQLClient } from "graphql-request";

interface State {
  fibEntryID?: string;
}

/** Enable prefix registration via NDN-DPDK GraphQL management API. */
export class NdndpdkPrefixReg extends ReadvertiseDestination<State> {
  constructor(private readonly client: GraphQLClient, private readonly faceID: string) {
    super();
  }

  protected async doAdvertise(name: Name, state: State) {
    const { insertFibEntry: { id } } = await this.client.request(gql`
      mutation insertFibEntry($name: Name!, $nexthops: [ID!]!, $strategy: ID) {
        insertFibEntry(name: $name, nexthops: $nexthops, strategy: $strategy) {
          id
        }
      }
    `, {
      name: name.toString(),
      nexthops: [this.faceID],
    });
    state.fibEntryID = id;
  }

  protected async doWithdraw(name: Name, state: State) {
    if (!state.fibEntryID) {
      return;
    }
    await this.client.request(gql`
      mutation delete($id: ID!) {
        delete(id: $id)
      }
    `, {
      id: state.fibEntryID,
    });
    delete state.fibEntryID;
  }
}
