import { Endpoint } from "@ndn/endpoint";
import { Forwarder, FwFace, TapFace } from "@ndn/fw";
import { L3Face } from "@ndn/l3face";
import { Interest, Name } from "@ndn/packet";
import hirestime from "hirestime";

import { createTransport } from "./platform/mod";

const getNow = hirestime();

async function testConnection(face: FwFace, name: Name = new Name("/localhop/nfd/rib/list")) {
  const tapFace = TapFace.create(face);
  tapFace.addRoute(name);
  const interest = new Interest(name, Interest.CanBePrefix,
                                Interest.Lifetime(1000));
  await new Endpoint({ fw: tapFace.fw }).consume(interest)
        .finally(() => tapFace.close());
}

function makeDefaultOptions() {
  return {
    fw: Forwarder.getDefault(),
    testConnection,
  } as connect.Options;
}

/** Connect to a router and test the connection. */
export async function connect(host: string, options: Partial<connect.Options> = {}): Promise<connect.Result> {
  const opts = { ...makeDefaultOptions(), ...options };
  const { fw, testConnection: tc } = opts;
  const transport = await createTransport(host, opts);
  const face = fw.addFace(new L3Face(transport));

  const testConnectionStart = getNow();
  let testConnectionDuration: number;
  let testConnectionResult: any;
  try {
    if (typeof tc === "function") {
      testConnectionResult = await tc(face);
    } else {
      await testConnection(face, tc);
    }
    testConnectionDuration = getNow() - testConnectionStart;
  } catch (err) {
    face.close();
    throw err;
  }
  return { face, testConnectionDuration, testConnectionResult };
}

export namespace connect {
  export interface Options {
    fw: Forwarder;

    /** Test that the face can reach a given name, or provide custom tester function. */
    testConnection: Name | ((face: FwFace) => Promise<any>);
  }

  export interface Result {
    /** Created face */
    face: FwFace;
    /** Execution duration of testConnection function. */
    testConnectionDuration: number;
    /** Return value from custom testConnection function. */
    testConnectionResult: any;
  }
}
