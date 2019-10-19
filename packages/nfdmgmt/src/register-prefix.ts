import { Advertise, FwFace } from "@ndn/fw";
import { Name } from "@ndn/name";

import { ControlCommand } from "./control-command";

type Options = Omit<ControlCommand.Options, "fw">;

class NfdAdvertise extends Advertise {
  constructor(face: FwFace, private readonly opt: Options) {
    super(face);
    face.addRoute(opt.commandPrefix || ControlCommand.localhostPrefix);
  }

  protected async doAdvertise(name: Name) {
    const cr = await ControlCommand.rpc("rib/register", {
      name,
      origin: 65,
      // tslint:disable-next-line:object-literal-sort-keys
      cost: 0x7473, // ASCII of 'ts'
      // tslint:disable-next-line:object-literal-sort-keys
      flags: 0,
    }, {
      ...this.opt,
      fw: this.face.fw,
    });
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  }

  protected async doWithdraw(name: Name) {
    const cr = await ControlCommand.rpc("rib/unregister", {
      name,
      origin: 65,
    }, {
      ...this.opt,
      fw: this.face.fw,
    });
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  }
}

/**
 * Enable prefix registration via NFD management protocol.
 * @param face face connected to NFD.
 * @param opt options.
 *
 * Currently, only one face may enable NFD prefix registration.
 */
export function enableNfdPrefixReg(face: FwFace, opt: Options) {
  face.advertise = new NfdAdvertise(face, opt);
}
