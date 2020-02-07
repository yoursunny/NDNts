import { Endpoint } from "@ndn/endpoint";
import { Advertise, FwFace, TapFace } from "@ndn/fw";
import { Name } from "@ndn/packet";

import { ControlCommand } from "./control-command";
import { ControlParameters } from "./control-parameters";

type CommandOptions = Omit<ControlCommand.Options, "endpoint">;
type RouteOptions = Pick<ControlParameters.Fields, "origin"|"cost"|"flags">;
type Options = CommandOptions & RouteOptions;

class NfdAdvertise extends Advertise {
  private commandOptions: CommandOptions;
  private routeOptions: RouteOptions;

  constructor(face: FwFace, opts: Options) {
    super(face);
    this.commandOptions = {
      ...opts,
    };
    if (!this.commandOptions.commandPrefix) {
      this.commandOptions.commandPrefix = ControlCommand.getPrefix(face.attributes.local);
    }
    this.routeOptions = {
      origin: 65,
      cost: 0x7473, // ASCII of 'ts'
      flags: 0x02, // CAPTURE
      ...opts,
    };
  }

  private tap(): [ControlCommand.Options, () => void] {
    const tapFace = TapFace.create(this.face);
    tapFace.addRoute(this.commandOptions.commandPrefix!);
    const endpoint = new Endpoint({ fw: tapFace.fw });
    return [{ ...this.commandOptions, endpoint }, () => tapFace.close()];
  }

  protected async doAdvertise(name: Name) {
    const [opts, untap] = this.tap();
    const cr = await ControlCommand.call("rib/register", {
      name,
      origin: this.routeOptions.origin,
      cost: this.routeOptions.cost,
      flags: this.routeOptions.flags,
    }, opts).finally(untap);
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  }

  protected async doWithdraw(name: Name) {
    const [opts, untap] = this.tap();
    const cr = await ControlCommand.call("rib/unregister", {
      name,
      origin: this.routeOptions.origin,
    }, opts).finally(untap);
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
