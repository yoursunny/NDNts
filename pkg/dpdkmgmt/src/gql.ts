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

export const CreateFace = gql`
  mutation createFace($locator: JSON!) {
    createFace(locator: $locator) {
      id
      locator
    }
  }
`;
export namespace CreateFace {
  export interface Vars extends Variables {
    locator: unknown;
  }

  export interface Resp {
    createFace: {
      id: string;
      locator: unknown;
    };
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
