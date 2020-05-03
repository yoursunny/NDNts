import { Endpoint } from "@ndn/endpoint";
import { FwFace, ReadvertiseDestination, TapFace } from "@ndn/fw";
import { Name } from "@ndn/packet";

import { ControlCommand } from "./control-command";
import { ControlParameters } from "./control-parameters";

type CommandOptions = Omit<ControlCommand.Options, "endpoint">;
type RouteOptions = Pick<ControlParameters.Fields, "origin"|"cost"|"flags">;
type Options = CommandOptions & RouteOptions & {
  retry?: ReadvertiseDestination.RetryOptions;

  /** How often to refresh prefix registration, false to disable. */
  refreshInterval?: number|false;
};

interface State {
  refreshTimer?: NodeJS.Timeout;
}

class NfdPrefixReg extends ReadvertiseDestination<State> {
  private commandOptions: CommandOptions;
  private routeOptions: RouteOptions;
  private refreshInterval: number|false;

  constructor(private readonly face: FwFace, opts: Options) {
    super(opts.retry);
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
    this.refreshInterval = opts.refreshInterval ?? 300000;
    face.once("close", () => this.disable());
  }

  private tap(): [ControlCommand.Options, () => void] {
    const tapFace = TapFace.create(this.face);
    tapFace.addRoute(this.commandOptions.commandPrefix!);
    const endpoint = new Endpoint({ fw: tapFace.fw });
    return [{ ...this.commandOptions, endpoint }, () => tapFace.close()];
  }

  protected async doAdvertise(name: Name, state: State, nameHex: string) {
    const [opts, untap] = this.tap();
    try {
      const cr = await ControlCommand.call("rib/register", {
        name,
        origin: this.routeOptions.origin,
        cost: this.routeOptions.cost,
        flags: this.routeOptions.flags,
      }, opts);
      if (cr.statusCode !== 200) {
        throw new Error(`${cr.statusCode} ${cr.statusText}`);
      }
    } finally {
      untap();
    }
    if (typeof this.refreshInterval === "number") {
      clearTimeout(state.refreshTimer!);
      state.refreshTimer = setTimeout(() => {
        this.table.get(nameHex)!.status = ReadvertiseDestination.Status.ADVERTISING;
        this.queue.push(nameHex);
      }, this.refreshInterval);
    }
  }

  protected async doWithdraw(name: Name, state: State) {
    clearTimeout(state.refreshTimer!);
    state.refreshTimer = undefined;

    if (this.closed) {
      return;
    }
    const [opts, untap] = this.tap();
    try {
      const cr = await ControlCommand.call("rib/unregister", {
        name,
        origin: this.routeOptions.origin,
      }, opts);
      if (cr.statusCode !== 200) {
        throw new Error(`${cr.statusCode} ${cr.statusText}`);
      }
    } finally {
      untap();
    }
  }
}

/**
 * Enable prefix registration via NFD management protocol.
 * @param face face connected to NFD.
 * @param opts options.
 */
export function enableNfdPrefixReg(face: FwFace, opts: Options = {}) {
  new NfdPrefixReg(face, opts).enable(face.fw);
}
