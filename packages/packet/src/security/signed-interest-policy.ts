import { assert, evict, toHex } from "@ndn/util";
import DefaultWeakMap from "mnemonist/default-weak-map.js";

import { Interest } from "../interest";
import { SigInfo } from "../sig-info";
import { LLSign, LLVerify, Signer, type Verifier } from "./signing";

/** Validation policy for SigInfo fields in signed Interest. */
export class SignedInterestPolicy {
  private readonly owned = new DefaultWeakMap<object, KeyState>(() => ({}));
  private readonly trackedKeys: number;
  private readonly records = new Map<string, KeyState>();
  private readonly rules: Rule[];

  /**
   * Constructor.
   * @param opts - Options.
   * @param rules -
   *  One or more rules created from {@link SignedInterestPolicy.Nonce},
   *  {@link SignedInterestPolicy.Time}, {@link SignedInterestPolicy.SeqNum}.
   */
  constructor(opts: SignedInterestPolicy.Options, ...rules: Rule[]);

  /**
   * Constructor.
   * @param rules -
   *  One or more rules created from {@link SignedInterestPolicy.Nonce},
   *  {@link SignedInterestPolicy.Time}, {@link SignedInterestPolicy.SeqNum}.
   */
  constructor(...rules: Rule[]);

  constructor(arg1?: SignedInterestPolicy.Options | Rule, ...rules: Rule[]) {
    let opts: SignedInterestPolicy.Options = {};
    if (typeof (arg1 as Rule | undefined)?.check === "function") {
      rules.unshift(arg1 as Rule);
    } else {
      opts = arg1 as SignedInterestPolicy.Options ?? {};
    }
    assert(rules.length > 0, "no rules");

    this.trackedKeys = opts.trackedKeys ?? 256;
    this.rules = rules;
  }

  /**
   * Assign SigInfo fields on an Interest before signing.
   * @param key - Signing key object to associate state with; if omitted, use global state.
   */
  public update(interest: Interest, key: object = this): void {
    const si = Signer.putSigInfo(interest);
    for (const rule of this.rules) {
      rule.update(si, this.owned.get(key));
    }
  }

  /**
   * Check SigInfo of an Interest.
   * @returns A function to save state after the Interest has passed all verifications.
   */
  public check({ sigInfo }: Interest): () => void {
    if (!sigInfo) {
      throw new Error("SignedInterestPolicy rejects unsigned Interest");
    }

    const key = (() => {
      const klName = sigInfo.keyLocator?.name;
      if (klName) {
        return `N:${klName.valueHex}`;
      }
      const klDigest = sigInfo.keyLocator?.digest;
      if (klDigest) {
        return `D:${toHex(klDigest)}`;
      }
      return "_:";
    })();

    const state = this.records.get(key) ?? {};
    const saves = this.rules.map((rule) => rule.check(sigInfo, state));

    return () => {
      for (const save of saves) {
        save();
      }
      this.records.delete(key);
      this.records.set(key, state);
      evict(this.trackedKeys, this.records);
    };
  }

  /**
   * Wrap an Interest to update/check SigInfo during signing/verification.
   *
   * @remarks
   * During signing, global state is being used because signer key cannot be detected.
   */
  public wrapInterest(interest: Interest): Signer.Signable & Verifier.Verifiable {
    return new Proxy(interest, {
      get: (target, prop: keyof Interest, receiver) => {
        switch (prop) {
          case LLSign.OP: {
            return (signer: LLSign) => {
              this.update(interest);
              return interest[LLSign.OP](signer);
            };
          }
          case LLVerify.OP: {
            return async (verify: LLVerify) => {
              const save = this.check(interest);
              await interest[LLVerify.OP](verify);
              save();
            };
          }
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }

  /**
   * Wrap a Signer to update SigInfo when signing an Interest.
   *
   * @remarks
   * State is associated with the provided Signer.
   */
  public makeSigner(inner: Signer): Signer {
    return {
      sign: (pkt: Signer.Signable): Promise<void> => {
        if (pkt instanceof Interest) {
          this.update(pkt, inner);
        }
        return inner.sign(pkt);
      },
    };
  }

  /** Wrap a Verifier to check the policy when verifying an Interest. */
  public makeVerifier(inner: Verifier, {
    passData = true,
    passUnsignedInterest = false,
  }: SignedInterestPolicy.WrapOptions = {}): Verifier {
    return {
      verify: async (pkt: Verifier.Verifiable): Promise<void> => {
        if (!(pkt instanceof Interest)) {
          if (passData) {
            return inner.verify(pkt);
          }
          throw new Error("SignedInterestPolicy rejects non-Interest");
        }

        if (!pkt.sigInfo && passUnsignedInterest) {
          return inner.verify(pkt);
        }

        const save = this.check(pkt);
        await inner.verify(pkt);
        save();
      },
    };
  }
}

interface KeyState {
  nonces?: Set<string>;
  time?: number;
  seqNum?: bigint;
}

interface Rule {
  update: (si: SigInfo, state: KeyState) => void;
  check: (si: SigInfo, state: KeyState) => () => void;
}

class NonceRule implements Rule {
  private readonly nonceLength: number;
  private readonly minNonceLength: number;
  private readonly trackedNonces: number;

  constructor({
    nonceLength = 8,
    minNonceLength = 8,
    trackedNonces = 256,
  }: SignedInterestPolicy.NonceOptions) {
    assert(nonceLength >= 1);
    assert(minNonceLength >= 1);
    assert(trackedNonces >= 1);
    this.nonceLength = nonceLength;
    this.minNonceLength = minNonceLength;
    this.trackedNonces = trackedNonces;
  }

  public update(si: SigInfo, state: KeyState) {
    let nonceHex: string;
    do {
      si.nonce = SigInfo.generateNonce(this.nonceLength);
      nonceHex = toHex(si.nonce);
    } while (state.nonces?.has(nonceHex));
    this.recordNonce(state, nonceHex);
  }

  public check(si: SigInfo, state: KeyState) {
    if (!si.nonce || si.nonce.length < this.minNonceLength) {
      throw new Error("SigNonce is absent or too short");
    }

    const nonceHex = toHex(si.nonce);
    if (state.nonces?.has(nonceHex)) {
      throw new Error("SigNonce is duplicate");
    }

    return () => this.recordNonce(state, nonceHex);
  }

  private recordNonce(state: KeyState, nonceHex: string): void {
    state.nonces ??= new Set<string>();
    state.nonces.add(nonceHex);
    evict(this.trackedNonces, state.nonces);
  }
}

class SequencedRuleBase<T extends number | bigint> {
  constructor(
      private readonly field: keyof KeyState & keyof SigInfo,
      private readonly name: string,
      private readonly max: (value: T, prev?: T) => T,
  ) {}

  public check(si: SigInfo, state: KeyState) {
    const value = si[this.field] as T | undefined;
    if (value === undefined) {
      throw new Error(`${this.name} is absent`);
    }

    const prev = state[this.field] as T | undefined;
    if (prev !== undefined && value <= prev) {
      throw new Error(`${this.name} reordering detected`);
    }

    return () => {
      (state[this.field] as T) = this.max(value, state[this.field] as T | undefined);
    };
  }
}

class TimeRule extends SequencedRuleBase<number> implements Rule {
  private readonly maxClockOffset: number;

  constructor({
    maxClockOffset = 60000,
  }: SignedInterestPolicy.TimeOptions) {
    super("time", "SigTime", (value, prev = 0) => Math.max(value, prev));
    assert(maxClockOffset >= 0);
    this.maxClockOffset = maxClockOffset;
  }

  public update(si: SigInfo, state: KeyState) {
    si.time = Math.max(Date.now(), 1 + (state.time ?? 0));
    state.time = si.time;
  }

  public override check(si: SigInfo, state: KeyState) {
    const save = super.check(si, state);

    const now = Date.now();
    if (Math.abs(now - si.time!) > this.maxClockOffset) {
      throw new Error("SigTime offset is too large");
    }

    return save;
  }
}

class SeqNumRule extends SequencedRuleBase<bigint> implements Rule {
  private readonly beforeInitialSeqNum: bigint;

  constructor({
    initialSeqNum = 0n,
  }: SignedInterestPolicy.SeqNumOptions) {
    super("seqNum", "SigSeqNum", (value, prev = 0n) => value > prev ? value : prev);
    this.beforeInitialSeqNum = initialSeqNum - 1n;
  }

  public update(si: SigInfo, state: KeyState) {
    state.seqNum ??= this.beforeInitialSeqNum;
    si.seqNum = ++state.seqNum;
  }
}

export namespace SignedInterestPolicy {
  /** Constructor options. */
  export interface Options {
    /**
     * How many distinct public keys to keep track.
     * Each different KeyLocator Name or KeyDigest is tracked separately.
     * @defaultValue 256
     *
     * @remarks
     * Minimum is 1.
     */
    trackedKeys?: number;
  }

  /** {@link SignedInterestPolicy.makeVerifier} options. */
  export interface WrapOptions {
    /**
     * If true, non-Interest packets are passed through to the inner Verifier.
     * If false, non-Interest packets are rejected.
     * @defaultValue true
     */
    passData?: boolean;

    /**
     * If true, Interests without SigInfo are passed through to the inner Verifier.
     * If false, Interests without SigInfo are rejected.
     * @defaultValue false
     */
    passUnsignedInterest?: boolean;
  }

  /** {@link SignedInterestPolicy.Nonce} options. */
  export interface NonceOptions {
    /**
     * Length of generated SigNonce.
     * @defaultValue 8
     *
     * @remarks
     * Minimum is 1.
     */
    nonceLength?: number;

    /**
     * Minimum required length of SigNonce.
     * @defaultValue 8
     *
     * @remarks
     * Minimum is 1.
     */
    minNonceLength?: number;

    /**
     * How many distinct SigNonce values to keep track, within each public key.
     * @defaultValue 256
     *
     * @remarks
     * Minimum is 1.
     */
    trackedNonces?: number;
  }

  /**
   * Create a rule to assign or check SigNonce.
   *
   * @remarks
   * This rule assigns a random SigNonce of `nonceLength` octets that does not duplicate
   * last `trackedNonces` values.
   *
   * This rule rejects an Interest on any of these conditions:
   * - SigNonce is absent.
   * - SigNonce has fewer than `minNonceLength` octets.
   * - SigNonce value duplicates any of last `trackedNonces` values.
   */
  export function Nonce(opts: NonceOptions = {}): Rule {
    return new NonceRule(opts);
  }

  /** {@link SignedInterestPolicy.Time} options. */
  export interface TimeOptions {
    /**
     * Maximum allowed clock offset in milliseconds.
     * @defaultValue 60000
     *
     * @remarks
     * Minimum is 0. However, setting to 0 is inadvisable because it would require consumer and
     * producer to have precisely synchronized clocks.
     */
    maxClockOffset?: number;
  }

  /**
   * Create a rule to assign or check SigTime.
   *
   * @remarks
   * This rule assigns SigTime to be same as current timestamp, but may increment if it
   * duplicates the previous value.
   *
   * This rule rejects an Interest on any of these conditions:
   * - SigTime is absent.
   * - SigTime differs from current timestamp by more than `maxClockOffset` milliseconds.
   * - SigTime value is less than or equal to a previous value.
   *
   * This check logic differs from NDN Packet Format v0.3 specification (as of 2020-September) in
   * that `maxClockOffset` is checked on every Interest rather than only the "initial" Interest.
   * It is the same behavior as ndn-cxx v0.7.1 implementation.
   * This logic offers better consistency as it has less dependency on internal state of the
   * SignedInterestPolicy. However, persistently sending more than 1000 signed Interests per second
   * would eventually push SigTime out of `maxClockOffset` range and cause rejections.
   */
  export function Time(opts: TimeOptions = {}): Rule {
    return new TimeRule(opts);
  }

  /** {@link SignedInterestPolicy.SeqNum} options. */
  export interface SeqNumOptions {
    /**
     * Initial sequence number.
     * @defaultValue 0n
     */
    initialSeqNum?: bigint;
  }

  /**
   * Create a rule to assign or check SigSeqNum.
   *
   * @remarks
   * This rule assigns SigSeqNum to `initialSegNum`, or increments from previous value.
   *
   * This rule rejects an Interest on any of these conditions:
   * - SigSeqNum is absent.
   * - SigSeqNum value is less than or equal to a previous value.
   */
  export function SeqNum(opts: SeqNumOptions = {}): Rule {
    return new SeqNumRule(opts);
  }
}
