import { Endpoint, type Producer } from "@ndn/endpoint";
import { type FwFace, ReadvertiseDestination, TapFace } from "@ndn/fw";
import { Certificate, type KeyChain } from "@ndn/keychain";
import { Interest, type Name, NameMap } from "@ndn/packet";
import { type Encodable, NNI } from "@ndn/tlv";
import { Closers } from "@ndn/util";
import map from "obliterator/map.js";
import type { Except, Promisable } from "type-fest";

import { RouteFlags, TT } from "./an-nfd";
import { getPrefix } from "./common";
import { type ControlCommandOptions, invokeGeneric } from "./control-command-generic";
import type { ControlParameters } from "./control-command-nfd";
import type { ControlResponse } from "./control-response";

type CommandOptions = Except<ControlCommandOptions, "endpoint" | "prefix">;
type RouteOptions = Pick<ControlParameters.Fields, "origin" | "cost" | `flag${keyof typeof RouteFlags}`>;
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
  private readonly commandOptions: Except<ControlCommandOptions, "endpoint">;
  private readonly routeOptions: [origin: Encodable, cost: Encodable, flags: Encodable];
  private readonly refreshInterval: number | false;
  private readonly preloadCertName?: Name;
  private readonly preloadFromKeyChain?: KeyChain;
  private readonly preloadInterestLifetime: ReturnType<typeof Interest.Lifetime>;
  private readonly preloadCerts = new NameMap<Certificate>();

  constructor(private readonly face: FwFace, opts: Options) {
    super(opts.retry);

    this.commandOptions = {
      prefix: getPrefix(face.attributes.local),
      ...opts,
    };

    const {
      origin = 65,
      cost = 0,
      flagChildInherit = false,
      flagCapture = true,
    } = opts;
    this.routeOptions = [
      [TT.Origin, NNI(origin)],
      [TT.Cost, NNI(cost)],
      [TT.Flags, NNI(
        (Number(flagChildInherit) * RouteFlags.ChildInherit) |
        (Number(flagCapture) * RouteFlags.Capture),
      )],
    ];

    this.refreshInterval = opts.refreshInterval ?? 300000;
    this.preloadCertName = opts.preloadCertName;
    this.preloadFromKeyChain = opts.preloadFromKeyChain;
    this.preloadInterestLifetime = Interest.Lifetime(opts.preloadInterestLifetime ?? 500);

    face.addEventListener("up", this.handleFaceUp);
    face.addEventListener("close", () => this.disable(), { once: true });
  }

  public override disable(): void {
    this.face.removeEventListener("up", this.handleFaceUp);
    super.disable();
  }

  private async tap<R>(f: (opts: ControlCommandOptions) => Promisable<R>): Promise<R> {
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
    try {
      return await f({ ...this.commandOptions, endpoint });
    } finally {
      closers.close();
    }
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
    if (this.refreshInterval !== false) {
      this.scheduleRefresh(name, state, this.refreshInterval);
    }

    const cr = await this.tap((opts) => invokeGeneric(
      "rib/register", [TT.ControlParameters, name, ...this.routeOptions], opts));
    this.checkSuccess(cr);
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
    const cr = await this.tap((opts) => invokeGeneric(
      "rib/unregister", [TT.ControlParameters, name, this.routeOptions[0]], opts));
    this.checkSuccess(cr);
  }

  private checkSuccess(cr: ControlResponse): void {
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
  new NfdPrefixReg(face, opts).enable(face.fw);
}
