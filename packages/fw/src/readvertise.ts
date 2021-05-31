import { Name } from "@ndn/packet";
import { fromHex } from "@ndn/tlv";
import pushable from "it-pushable";
import MultiMap from "mnemonist/multi-map.js";
import * as retry from "retry";

import type { FaceImpl } from "./face";
import type { Forwarder, ForwarderImpl } from "./forwarder";

/**
 * Manage advertised prefix of the forwarder.
 *
 * This class keeps track of what prefixes are announced by the owning forwarder.
 * It accepts announcements from faces attached to the forwarder, and then informs
 * each destination on what prefixes should be advertised.
 */
export class Readvertise {
  constructor(public readonly fw: ForwarderImpl) {}

  public readonly announcements = new MultiMap<string, FaceImpl>(Set);
  public readonly destinations = new Set<ReadvertiseDestination>();

  public addAnnouncement(face: FaceImpl, name: Name, nameHex: string) {
    this.announcements.set(nameHex, face);
    if (this.announcements.multiplicity(nameHex) > 1) {
      return;
    }

    this.fw.emit("annadd", name);
    for (const dest of this.destinations) {
      dest.advertise(name, nameHex);
    }
  }

  public removeAnnouncement(face: FaceImpl, name: Name | undefined, nameHex: string) {
    this.announcements.remove(nameHex, face);
    if (this.announcements.multiplicity(nameHex) > 0) {
      return;
    }

    name ??= new Name(fromHex(nameHex));
    this.fw.emit("annrm", name);
    for (const dest of this.destinations) {
      dest.withdraw(name, nameHex);
    }
  }
}

/**
 * A destination of prefix advertisement.
 *
 * Generally, a prefix advertised to a destination would cause Interests matching the prefix
 * to come to the forwarder. aka prefix registration.
 */
export abstract class ReadvertiseDestination<State extends {} = {}> {
  private readvertise?: Readvertise;
  protected readonly table = new Map<string, ReadvertiseDestination.Record<State>>();
  protected readonly queue = pushable<string>();
  protected closed = false;

  constructor(private readonly retryOptions: ReadvertiseDestination.RetryOptions = {
    forever: true,
    minTimeout: 5000,
    maxTimeout: 60000,
    randomize: true,
  }) {}

  /** Enable and attach to a forwarder. */
  public enable(fw: Forwarder): void {
    this.readvertise = (fw as ForwarderImpl).readvertise;
    this.readvertise.destinations.add(this);
    for (const nameHex of this.readvertise.announcements.keys()) {
      this.queue.push(nameHex);
    }
    this.process(); // eslint-disable-line @typescript-eslint/no-floating-promises
  }

  /**
   * Disable and detach from forwarder.
   *
   * Once detached, this instance is no longer usable.
   */
  public disable(): void {
    this.readvertise?.destinations.delete(this);
    this.readvertise = undefined;
    for (const [nameHex, record] of this.table) {
      this.queue.push(nameHex);
      record.status = ReadvertiseDestination.Status.WITHDRAWING;
    }
    this.queue.end();
    this.closed = true;
  }

  /** Set a prefix to be advertised. */
  public advertise(name: Name, nameHex: string): void {
    let record = this.table.get(nameHex);
    if (!record) {
      record = {
        name,
        status: ReadvertiseDestination.Status.ADVERTISING,
        state: this.makeState(name, nameHex),
      };
      this.table.set(nameHex, record);
    }
    record.status = ReadvertiseDestination.Status.ADVERTISING;
    this.restart(nameHex, record);
  }

  /** Set a prefix to be withdrawn. */
  public withdraw(name: Name, nameHex: string): void {
    const record = this.table.get(nameHex);
    if (!record) {
      return;
    }
    record.status = ReadvertiseDestination.Status.WITHDRAWING;
    this.restart(nameHex, record);
  }

  private restart(nameHex: string, record: ReadvertiseDestination.Record<State>) {
    record.retry?.stop();
    record.retry = retry.operation(this.retryOptions);
    record.retry.attempt(() => {
      if (this.closed) {
        record.retry!.stop();
      } else {
        this.queue.push(nameHex);
      }
    });
  }

  private async process() {
    for await (const nameHex of this.queue) {
      const record = this.table.get(nameHex);
      if (!record) { continue; }
      const { name, status, retry, state } = record;
      switch (status) {
        case ReadvertiseDestination.Status.ADVERTISING:
          try {
            await this.doAdvertise(name, state, nameHex);
            if (record.status === ReadvertiseDestination.Status.ADVERTISING) {
              record.status = ReadvertiseDestination.Status.ADVERTISED;
              retry!.stop();
            }
          } catch (err: unknown) {
            retry!.retry(err as Error);
          }
          break;
        case ReadvertiseDestination.Status.WITHDRAWING:
          try {
            await this.doWithdraw(record.name, state, nameHex);
            if (record.status === ReadvertiseDestination.Status.WITHDRAWING) {
              record.status = ReadvertiseDestination.Status.WITHDRAWN;
              retry!.stop();
              this.table.delete(nameHex);
            }
          } catch (err: unknown) {
            retry!.retry(err as Error);
          }
          break;
      }
    }
  }

  /** Create per-prefix state. */
  protected makeState(name: Name, nameHex: string): State {
    return {} as any;
  }

  /** Advertise a prefix once. */
  protected abstract doAdvertise(name: Name, state: State, nameHex: string): Promise<void>;

  /** Withdraw a prefix once. */
  protected abstract doWithdraw(name: Name, state: State, nameHex: string): Promise<void>;
}

export namespace ReadvertiseDestination {
  export type RetryOptions = retry.OperationOptions;

  export enum Status {
    ADVERTISING,
    ADVERTISED,
    WITHDRAWING,
    WITHDRAWN,
  }

  export interface Record<State> {
    name: Name;
    status: Status;
    retry?: retry.RetryOperation;
    state: State;
  }
}
