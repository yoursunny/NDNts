import { Endpoint, Producer } from "@ndn/endpoint";
import { FwFace, ReadvertiseDestination, TapFace } from "@ndn/fw";
import { type KeyChain, Certificate } from "@ndn/keychain";
import { type Name, Interest, NameMap } from "@ndn/packet";
import { Closers } from "@ndn/util";
import map from "obliterator/map.js";

import { ControlCommand } from "./control-command";
import type { ControlParameters } from "./control-parameters";

type CommandOptions = Omit<ControlCommand.Options, "endpoint">;
type RouteOptions = Pick<ControlParameters.Fields, "origin" | "cost" | "flags">;
type Options = CommandOptions & RouteOptions & {
  retry?: ReadvertiseDestination.RetryOptions;

  /** How often to refresh prefix registration, false to disable. */
  refreshInterval?: number | false;

  /** Set to signer name to retrieve and serve certificate chain. */
  preloadCertName?: Name;

  /** Local KeyChain to collect preloaded certificates. */
  preloadFromKeyChain?: KeyChain;

  /** InterestLifetime for retrieving preloaded certificates. */
  preloadInterestLifetime?: number;
};

interface State {
  refreshTimer?: NodeJS.Timeout | number;
}

class NfdPrefixReg extends ReadvertiseDestination<State> {
  private readonly commandOptions: CommandOptions;
  private readonly routeOptions: RouteOptions;
  private readonly refreshInterval: number | false;
  private readonly preloadCertName?: Name;
  private readonly preloadFromKeyChain?: KeyChain;
  private readonly preloadInterestLifetime: ReturnType<typeof Interest.Lifetime>;
  private readonly preloadCerts = new NameMap<Certificate>();

  constructor(private readonly face: FwFace, opts: Options) {
    super(opts.retry);

    this.commandOptions = {
      commandPrefix: ControlCommand.getPrefix(face.attributes.local),
      ...opts,
    };

    this.routeOptions = {
      origin: 65,
      cost: 0,
      flags: 0x02, // CAPTURE
      ...opts,
    };

    this.refreshInterval = opts.refreshInterval ?? 300000;
    this.preloadCertName = opts.preloadCertName;
    this.preloadFromKeyChain = opts.preloadFromKeyChain;
    this.preloadInterestLifetime = Interest.Lifetime(opts.preloadInterestLifetime ?? 500);

    face.on("up", this.handleFaceUp);
    face.once("close", () => this.disable());
  }

  public override disable(): void {
    this.face.off("up", this.handleFaceUp);
    super.disable();
  }

  private async tap(): Promise<[opts: ControlCommand.Options, untap: () => void]> {
    const tapFace = TapFace.create(this.face);
    tapFace.addRoute("/");
    const endpoint = new Endpoint({
      announcement: false,
      describe: "NfdPrefixReg",
      fw: tapFace.fw,
    });
    const preloadProducers = await this.preload(endpoint);

    const closers = new Closers();
    closers.push(...map(preloadProducers, ([, p]) => p), tapFace);
    return [
      { ...this.commandOptions, endpoint },
      closers.close,
    ];
  }

  private async preload(endpoint: Endpoint) {
    const producers = new NameMap<Producer>();
    let name = this.preloadCertName;
    while (name && !producers.has(name)) {
      try {
        const cert = await this.retrievePreload(endpoint, name);
        this.preloadCerts.set(name, cert);
        producers.set(name, endpoint.produce(name, async () => cert.data));
        name = cert.issuer;
      } catch {
        name = undefined;
      }
    }
    return producers;
  }

  private async retrievePreload(endpoint: Endpoint, name: Name): Promise<Certificate> {
    const cert = this.preloadCerts.get(name);
    if (cert) {
      return cert;
    }

    if (this.preloadFromKeyChain) {
      try {
        return await this.preloadFromKeyChain.getCert(name);
      } catch {}
    }

    const interest = new Interest(name, Interest.CanBePrefix, this.preloadInterestLifetime);
    const data = await endpoint.consume(interest);
    return Certificate.fromData(data);
  }

  private readonly handleFaceUp = () => {
    for (const [name, { status, state }] of this.table) {
      if (status === ReadvertiseDestination.Status.ADVERTISED) {
        this.scheduleRefresh(name, state, 100);
      }
    }
  };

  protected override async doAdvertise(name: Name, state: State) {
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
    if (this.refreshInterval !== false) {
      this.scheduleRefresh(name, state, this.refreshInterval);
    }
  }

  private scheduleRefresh(name: Name, state: State, after: number): void {
    clearTimeout(state.refreshTimer);
    state.refreshTimer = setTimeout(() => {
      const record = this.table.get(name);
      if (record?.status === ReadvertiseDestination.Status.ADVERTISED) {
        record.status = ReadvertiseDestination.Status.ADVERTISING;
        this.restart(name, record);
      }
    }, after);
  }

  protected override async doWithdraw(name: Name, state: State) {
    clearTimeout(state.refreshTimer);
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
