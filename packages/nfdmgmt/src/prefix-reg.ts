import { Advertise, FwFace } from "@ndn/fw";
import { Name } from "@ndn/name";

import { ControlCommand } from "./control-command";

type Options = Omit<ControlCommand.Options, "fw">;

class NfdAdvertise extends Advertise {
  private readonly opts: ControlCommand.Options;

  constructor(face: FwFace, opts: Options) {
    super(face);
    this.opts = {
      ...opts,
      fw: face.fw,
    };
    this.opts.commandPrefix = this.opts.commandPrefix ?? ControlCommand.getPrefix(face.attributes.local);
    face.addRoute(this.opts.commandPrefix);
  }

  protected async doAdvertise(name: Name) {
    const cr = await ControlCommand.call("rib/register", {
      name,
      origin: 65,
      cost: 0x7473, // ASCII of 'ts'
      flags: 0,
    }, this.opts);
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  }

  protected async doWithdraw(name: Name) {
    const cr = await ControlCommand.call("rib/unregister", {
      name,
      origin: 65,
    }, this.opts);
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  }
}

/**
 * Enable prefix registration via NFD management protocol.
 * @param face face connected to NFD.
 * @param opts options.
 *
 * Only one face can enable NFD prefix registration. Enabling on multiple faces will result in
 * unstable operation because command Interests would go to every face but only one reply Data
 * could reach this module.
 */
export function enableNfdPrefixReg(face: FwFace, opts: Options = {}) {
  face.advertise = new NfdAdvertise(face, opts);
}
