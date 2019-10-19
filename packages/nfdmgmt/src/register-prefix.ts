import { FwFace } from "@ndn/fw";
import { Name } from "@ndn/name";

import { ControlCommand } from "./control-command";

export function enableNfdPrefixReg(face: FwFace, opt: Omit<ControlCommand.Options, "fw">) {
  face.addRoute(new Name("/localhop/nfd"));

  face.registerPrefix = async function(this: FwFace, name: Name): Promise<void> {
    const cr = await ControlCommand.rpc("rib/register", {
      name,
      origin: 65,
      // tslint:disable-next-line:object-literal-sort-keys
      cost: 0x7473, // 'ts'
      // tslint:disable-next-line:object-literal-sort-keys
      flags: 0,
    }, {
      ...opt,
      fw: this.fw,
    });
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  };

  face.unregisterPrefix = async function(this: FwFace, name: Name): Promise<void> {
    const cr = await ControlCommand.rpc("rib/unregister", {
      name,
      origin: 65,
    }, {
      ...opt,
      fw: this.fw,
    });
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  };
}
