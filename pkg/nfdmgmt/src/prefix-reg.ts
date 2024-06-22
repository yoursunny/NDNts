import { consume, type ConsumerOptions, produce, type Producer, type ProducerOptions } from "@ndn/endpoint";
import { type FwFace, ReadvertiseDestination, TapFace } from "@ndn/fw";
import { Certificate, type KeyChain } from "@ndn/keychain";
import { Interest, type Name, NameMap } from "@ndn/packet";
import { type Encodable, NNI } from "@ndn/tlv";
import { Closers, randomJitter } from "@ndn/util";
import map from "obliterator/map.js";
import type { Except, Promisable } from "type-fest";

import { RouteFlags } from "./an-nfd-prefixreg";
import { getPrefix } from "./common";
import { type ControlCommandOptions, invokeGeneric } from "./control-command-generic";
import type { ControlParameters } from "./control-command-nfd";
import type { ControlResponse } from "./control-response";

const enum TT {
  ControlParameters = 0x68,
  Cost = 0x6A,
  ExpirationPeriod = 0x6D,
  Flags = 0x6C,
  Origin = 0x6F,
  // don't import an-nfd.ts to reduce browser bundle size
  // unit tests verify consistency of those TLV-TYPE numbers
}

interface State {
  refreshTimer?: NodeJS.Timeout | number;
}

/** Readvertise prefix announcements via NFD prefix registration protocol. */
export class NfdPrefixReg extends ReadvertiseDestination<State> {
  private readonly commandOptions: ControlCommandOptions;
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
      refreshInterval = 300000,
    } = opts;
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
    const eOpts: ConsumerOptions & ProducerOptions = {
      announcement: false,
      describe: "NfdPrefixReg",
      fw: tapFace.fw,
    };
    const preloadProducers = await this.preload(eOpts);

    using closers = new Closers();
    closers.push(...map(preloadProducers, ([, p]) => p), tapFace);
    // https://github.com/typescript-eslint/typescript-eslint/issues/7889

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

    const cr = await this.tap((opts) => invokeGeneric(
      "rib/register", [TT.ControlParameters, name, ...this.routeElements], opts));
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
      "rib/unregister", [TT.ControlParameters, name, this.routeElements[0]], opts));
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
  export type Options =
  Except<ControlCommandOptions, "prefix"> &
  Pick<ControlParameters.Fields, "origin" | "cost" | `flag${keyof typeof RouteFlags}`> &
  {
    retry?: ReadvertiseDestination.RetryOptions;

    /**
     * How often to refresh prefix registration (in milliseconds).
     * Set to `false` disables refreshing.
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
     * @defaultValue 500
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
