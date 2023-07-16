import { gql, type Variables } from "graphql-request";

export const Delete = gql`
  mutation delete($id: ID!) {
    delete(id: $id)
  }
`;
export namespace Delete {
  export interface Vars extends Variables {
    id: string;
  }

  export interface Resp {
    delete: boolean;
  }
}

export const InsertFibEntry = gql`
  mutation insertFibEntry($name: Name!, $nexthops: [ID!]!, $strategy: ID) {
    insertFibEntry(name: $name, nexthops: $nexthops, strategy: $strategy) {
      id
    }
  }
`;
export namespace InsertFibEntry {
  export interface Vars extends Variables {
    name: string;
    nexthops: string[];
    strategy?: string;
  }

  export interface Resp {
    insertFibEntry: {
      id: string;
    };
  }
}
