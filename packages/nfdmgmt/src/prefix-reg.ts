import { Advertise, FwFace } from "@ndn/fw";
import { Name } from "@ndn/name";

import { ControlCommand } from "./control-command";

type Options = Omit<ControlCommand.Options, "fw">;

class NfdAdvertise extends Advertise {
  constructor(face: FwFace, private readonly opt: Options) {
    super(face);
    face.addRoute(opt.commandPrefix ?? ControlCommand.localhostPrefix);
  }

  protected async doAdvertise(name: Name) {
    const cr = await ControlCommand.call("rib/register", {
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
    const cr = await ControlCommand.call("rib/unregister", {
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
 * Only one face can enable NFD prefix registration. Enabling on multiple faces will result in
 * unstable operation because command Interests would go to every face but only one reply Data
 * could reach this module.
 */
export function enableNfdPrefixReg(face: FwFace, opt: Options = {}) {
  face.advertise = new NfdAdvertise(face, opt);
}
