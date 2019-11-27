import { Endpoint } from "@ndn/endpoint";
import { Advertise, FwFace, TapFace } from "@ndn/fw";
import { Name } from "@ndn/packet";

import { ControlCommand } from "./control-command";

type Options = Omit<ControlCommand.Options, "endpoint">;

class NfdAdvertise extends Advertise {
  constructor(face: FwFace, private readonly opts: Options) {
    super(face);
    this.opts.commandPrefix = this.opts.commandPrefix ?? ControlCommand.getPrefix(face.attributes.local);
  }

  private tap(): [Endpoint, () => void] {
    const tapFace = TapFace.create(this.face);
    tapFace.addRoute(this.opts.commandPrefix!);
    const endpoint = new Endpoint({ fw: tapFace.fw });
    return [endpoint, () => tapFace.close()];
  }

  protected async doAdvertise(name: Name) {
    const [endpoint, untap] = this.tap();
    const cr = await ControlCommand.call("rib/register", {
      name,
      origin: 65,
      cost: 0x7473, // ASCII of 'ts'
      flags: 0,
    }, { ...this.opts, endpoint }).finally(untap);
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  }

  protected async doWithdraw(name: Name) {
    const [endpoint, untap] = this.tap();
    const cr = await ControlCommand.call("rib/unregister", {
      name,
      origin: 65,
    }, { ...this.opts, endpoint }).finally(untap);
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  }
}

/**
 * Enable prefix registration via NFD management protocol.
 * @param face face connected to NFD.
 * @param opts options.
 */
export function enableNfdPrefixReg(face: FwFace, opts: Options = {}) {
  face.advertise = new NfdAdvertise(face, opts);
}
