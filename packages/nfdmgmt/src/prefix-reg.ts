import { Endpoint, Producer } from "@ndn/endpoint";
import { FwFace, ReadvertiseDestination, TapFace } from "@ndn/fw";
import { Certificate } from "@ndn/keychain";
import { Interest, Name } from "@ndn/packet";
import { toHex } from "@ndn/tlv";

import { ControlCommand } from "./control-command";
import type { ControlParameters } from "./control-parameters";

type CommandOptions = Omit<ControlCommand.Options, "endpoint">;
type RouteOptions = Pick<ControlParameters.Fields, "origin"|"cost"|"flags">;
type Options = CommandOptions & RouteOptions & {
  retry?: ReadvertiseDestination.RetryOptions;

  /** How often to refresh prefix registration, false to disable. */
  refreshInterval?: number|false;

  /** Set to signer name to retrieve and serve certificate chain. */
  preloadCertName?: Name;
};

const PRELOAD_INTEREST_LIFETIME = Interest.Lifetime(500);

interface State {
  refreshTimer?: NodeJS.Timeout;
}

class NfdPrefixReg extends ReadvertiseDestination<State> {
  private readonly commandOptions: CommandOptions;
  private readonly routeOptions: RouteOptions;
  private readonly refreshInterval: number|false;
  private readonly preloadCertName: Name|undefined;
  private readonly preloadCerts = new Map<string, Certificate>();

  constructor(private readonly face: FwFace, opts: Options) {
    super(opts.retry);

    this.commandOptions = {
      commandPrefix: ControlCommand.getPrefix(face.attributes.local),
      ...opts,
    };

    this.routeOptions = {
      origin: 65,
      cost: 0x7473, // ASCII of 'ts'
      flags: 0x02, // CAPTURE
      ...opts,
    };

    this.refreshInterval = opts.refreshInterval ?? 300000;
    this.preloadCertName = opts.preloadCertName;
    face.once("close", () => this.disable());
  }

  private async tap(): Promise<[opts: ControlCommand.Options, untap: () => void]> {
    const tapFace = TapFace.create(this.face);
    tapFace.addRoute(new Name("/"));
    const endpoint = new Endpoint({
      announcement: false,
      describe: "NfdPrefixReg",
      fw: tapFace.fw,
    });
    const preloadProducers = await this.preload(endpoint);
    return [
      { ...this.commandOptions, endpoint },
      () => {
        preloadProducers.forEach((p) => p.close());
        tapFace.close();
      },
    ];
  }

  private async preload(endpoint: Endpoint) {
    const producers = new Map<string, Producer>();
    let name = this.preloadCertName;
    while (name) {
      const key = toHex(name.value);
      if (producers.has(key)) {
        break;
      }
      try {
        const cert = this.preloadCerts.get(key) ?? Certificate.fromData(
          await endpoint.consume(new Interest(name, Interest.CanBePrefix, PRELOAD_INTEREST_LIFETIME)));
        this.preloadCerts.set(key, cert);
        producers.set(key, endpoint.produce(name, () => Promise.resolve(cert.data)));
        name = cert.issuer;
      } catch {
        name = undefined;
      }
    }
    return producers;
  }

  protected async doAdvertise(name: Name, state: State, nameHex: string) {
    const [opts, untap] = await this.tap();
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
    const [opts, untap] = await this.tap();
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
