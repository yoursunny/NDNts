import { consume, type ConsumerOptions, produce, type Producer, type ProducerOptions } from "@ndn/endpoint";
import { type FwFace, ReadvertiseDestination, TapFace } from "@ndn/fw";
import { Certificate, type KeyChain } from "@ndn/keychain";
import { Interest, type Name, NameMap } from "@ndn/packet";
import { type Encodable, NNI } from "@ndn/tlv";
import { Closers, randomJitter } from "@ndn/util";
import filter from "obliterator/filter.js";
import map from "obliterator/map.js";
import take from "obliterator/take.js";
import type { Except, Promisable } from "type-fest";

import { RouteFlags, RouteOrigin, TT } from "./an-nfd-prefixreg";
import { getPrefix } from "./common";
import { ControlCommandOptions, invokeGeneric } from "./control-command-generic";
import type { ControlParameters } from "./control-command-nfd";
import type { ControlResponse } from "./control-response";
import type { PrefixAnn } from "./prefix-ann";

interface State {
  refreshTimer?: NodeJS.Timeout | number;
  pa?: PrefixAnn;
}

/** Readvertise prefix announcements via NFD prefix registration protocol. */
export class NfdPrefixReg extends ReadvertiseDestination<State> {
  private readonly commandOptions: ControlCommandOptions;
  private readonly PrefixAnn?: typeof PrefixAnn;
  private readonly routeElements: [origin: Encodable, cost: Encodable, flags: Encodable, expiry: Encodable];
  private readonly refreshInterval?: () => number;
  private readonly preloadCertName?: Name;
  private readonly preloadFromKeyChain?: KeyChain;
  private readonly preloadInterestLifetime: ReturnType<typeof Interest.Lifetime>;
  private readonly preloadCerts = new NameMap<Certificate>();

  /**
   * Constructor.
   *
   * @remarks
   * {@link enableNfdPrefixReg} is recommended.
   */
  constructor(private readonly face: FwFace, opts: NfdPrefixReg.Options) {
    const {
      origin = RouteOrigin.client,
      cost = 0,
      flagChildInherit = false,
      flagCapture = true,
      retry,
      refreshInterval = 300000,
      preloadCertName,
      preloadFromKeyChain,
      preloadInterestLifetime = 1500,
    } = opts;
    super(retry);

    this.commandOptions = {
      prefix: getPrefix(face.attributes.local),
      ...opts,
    };

    this.PrefixAnn = opts.PrefixAnn;

    this.routeElements = [
      [TT.Origin, NNI(origin)],
      [TT.Cost, NNI(cost)],
      [TT.Flags, NNI(
        (Number(flagChildInherit) * RouteFlags.ChildInherit) |
        (Number(flagCapture) * RouteFlags.Capture),
      )],
      undefined,
    ];
    if (refreshInterval !== false) {
      this.routeElements[3] = [TT.ExpirationPeriod, NNI(Math.max(refreshInterval * 4, 60000))];
      this.refreshInterval = randomJitter(0.1, refreshInterval);
    }

    this.preloadCertName = preloadCertName;
    this.preloadFromKeyChain = preloadFromKeyChain;
    this.preloadInterestLifetime = Interest.Lifetime(preloadInterestLifetime);

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
    const eOpts: ConsumerOptions & ProducerOptions = {
      announcement: false,
      describe: "NfdPrefixReg",
      fw: tapFace.fw,
    };
    const preloadProducers = await this.preload(eOpts);

    using closers = new Closers();
    closers.push(...map(preloadProducers, ([, p]) => p), tapFace);
    return await f({ ...this.commandOptions, cOpts: eOpts });
  }

  private async preload(eOpts: ConsumerOptions & ProducerOptions) {
    const producers = new NameMap<Producer>();
    let name = this.preloadCertName;
    while (name && !producers.has(name)) {
      try {
        const cert = await this.retrievePreload(name, eOpts);
        this.preloadCerts.set(name, cert);
        producers.set(name, produce(name, async () => cert.data, eOpts));
        name = cert.issuer;
      } catch {
        name = undefined;
      }
    }
    return producers;
  }

  private async retrievePreload(name: Name, cOpts: ConsumerOptions): Promise<Certificate> {
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
    const data = await consume(interest, cOpts);
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
    if (this.refreshInterval !== undefined) {
      this.scheduleRefresh(name, state, this.refreshInterval());
    }

    if (this.PrefixAnn) {
      const [pa] = take(filter(
        this.listAnnouncementObjs(name), (ann) => ann instanceof this.PrefixAnn!,
      ), 1);
      state.pa = pa as PrefixAnn;
    }

    const cr = await this.tap((opts) => {
      if (state.pa) {
        return invokeGeneric("rib/announce", state.pa.data, {
          ...opts,
          formatCommand: ControlCommandOptions.formatCommandAppParams,
        });
      }
      return invokeGeneric("rib/register", [TT.ControlParameters, name, ...this.routeElements], opts);
    });
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

    const cr = await this.tap((opts) => invokeGeneric("rib/unregister", [
      TT.ControlParameters,
      name,
      state.pa ? [TT.Origin, NNI(RouteOrigin.prefixann)] : this.routeElements[0],
    ], opts));
    this.checkSuccess(cr);
  }

  private checkSuccess(cr: ControlResponse): void {
    if (cr.statusCode !== 200) {
      throw new Error(`${cr.statusCode} ${cr.statusText}`);
    }
  }
}
export namespace NfdPrefixReg {
  /** {@link enableNfdPrefixReg} options. */
  export type Options = Except<ControlCommandOptions, "prefix"> & (
    Pick<ControlParameters.Fields, "origin" | "cost" | `flag${keyof typeof RouteFlags}`>
  ) & {
    /**
     * Opt-in to Prefix Announcement Protocol.
     * @see {@link https://redmine.named-data.net/projects/nfd/wiki/PrefixAnnouncement}
     *
     * To opt-in, set this field to `PrefixAnn` imported from this package.
     * Producer must supply Prefix Announcement objects to the FwFace so that they are available
     * for use in the readvertise destinations.
     *
     * Currently, the following limitations apply for the Prefix Announcement Protocol:
     * - Not all NFD deployments can accept this protocol.
     * - You cannot specify Origin, Cost, Flags of the route.
     * - The announced prefix will not be further propagated, because NFD considers routes with
     *   Origin=65 to be propagable but the route Origin cannot be specified.
     */
    PrefixAnn?: typeof PrefixAnn;

    /** Retry options for each advertise/withdraw operation. */
    retry?: ReadvertiseDestination.RetryOptions;

    /**
     * How often to refresh prefix registration (in milliseconds).
     * Random jitter of ±10% is applied automatically.
     * Set to `false` disables refreshing.
     *
     * @defaultValue 300 seconds
     *
     * @remarks
     * For rib/register command, the ExpirationPeriod is set to 4x of this refresh interval,
     * with a minimum of 60 seconds.
     *
     * For rib/announce command, the application must make sure each supplied Prefix Announcement
     * object has an ExpirationPeriod at least 2x of this refresh interval and a ValidityPeriod
     * that extends beyond the anticipated producer runtime.
     */
    refreshInterval?: number | false;

    /**
     * Set to signer name to retrieve and serve certificate chain.
     * If unset, no certificates will be served.
     */
    preloadCertName?: Name;

    /**
     * Local KeyChain to collect preloaded certificates.
     * If unset, certificates will not be collected from a local KeyChain.
     */
    preloadFromKeyChain?: KeyChain;

    /**
     * InterestLifetime for retrieving preloaded certificates.
     * @defaultValue 1500
     */
    preloadInterestLifetime?: number;
  };
}

/**
 * Enable prefix registration via NFD management protocol.
 * @param face - Face connected to NFD.
 * @returns NFD prefix registration module.
 */
export function enableNfdPrefixReg(face: FwFace, opts: NfdPrefixReg.Options = {}): NfdPrefixReg {
  const reg = new NfdPrefixReg(face, opts);
  reg.enable(face.fw);
  return reg;
}
