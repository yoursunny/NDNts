import { type Name, NameMap, NameMultiMap } from "@ndn/packet";
import { pushable } from "it-pushable";
import * as retry from "retry";

import type { FaceImpl } from "./face";
import { Forwarder, type ForwarderImpl } from "./forwarder";

/**
 * Manage advertised prefix of the forwarder.
 *
 * @remarks
 * This class keeps track of what prefixes are announced by the owning forwarder.
 * It accepts announcements from faces attached to the forwarder, and then informs
 * each destination on what prefixes should be advertised.
 */
export class Readvertise {
  constructor(public readonly fw: ForwarderImpl) {}

  public readonly announcements = new NameMultiMap<FaceImpl>();
  public readonly destinations = new Set<ReadvertiseDestination>();

  public addAnnouncement(face: FaceImpl, name: Name) {
    if (this.announcements.add(name, face) > 1) {
      return;
    }

    this.fw.dispatchTypedEvent("annadd", new Forwarder.AnnouncementEvent("annadd", name));
    for (const dest of this.destinations) {
      dest.advertise(name);
    }
  }

  public removeAnnouncement(face: FaceImpl, name: Name) {
    if (this.announcements.remove(name, face) > 0) {
      return;
    }

    this.fw.dispatchTypedEvent("annrm", new Forwarder.AnnouncementEvent("annrm", name));
    for (const dest of this.destinations) {
      dest.withdraw(name);
    }
  }

  /**
   * Cancel timers and other I/O resources.
   * This instance should not be used after this operation.
   */
  public close(): void {
    for (const dest of this.destinations) {
      dest.disable();
    }
  }
}

/**
 * A destination of prefix advertisement.
 *
 * @remarks
 * Generally, a prefix advertised to a destination would cause Interests matching the prefix
 * to come to the local logical forwarder, aka prefix registration.
 */
export abstract class ReadvertiseDestination<State extends {} = {}> {
  private readvertise?: Readvertise;
  protected readonly table = new NameMap<ReadvertiseDestination.Record<State>>();
  protected readonly queue = pushable<Name>({ objectMode: true });
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
    for (const [name] of this.readvertise.announcements.associations()) {
      this.advertise(name);
    }
    void this.process();
  }

  /**
   * Disable and detach from forwarder.
   *
   * @remarks
   * Once detached, this instance is no longer usable.
   */
  public disable(): void {
    this.readvertise?.destinations.delete(this);
    this.readvertise = undefined;
    for (const [name, record] of this.table) {
      this.queue.push(name);
      record.status = ReadvertiseDestination.Status.WITHDRAWING;
    }
    this.queue.end();
    this.closed = true;
  }

  /** Set a prefix to be advertised. */
  public advertise(name: Name): void {
    let record = this.table.get(name);
    if (!record) {
      record = {
        status: ReadvertiseDestination.Status.ADVERTISING,
        state: this.makeState(name),
      };
      this.table.set(name, record);
    }
    record.status = ReadvertiseDestination.Status.ADVERTISING;
    this.restart(name, record);
  }

  /** Set a prefix to be withdrawn. */
  public withdraw(name: Name): void {
    const record = this.table.get(name);
    if (!record) {
      return;
    }
    record.status = ReadvertiseDestination.Status.WITHDRAWING;
    this.restart(name, record);
  }

  protected restart(name: Name, record: ReadvertiseDestination.Record<State>) {
    record.retry?.stop();
    record.retry = retry.operation(this.retryOptions);
    record.retry.attempt(() => {
      if (this.closed) {
        record.retry!.stop();
      } else {
        this.queue.push(name);
      }
    });
  }

  private async process() {
    for await (const name of this.queue) {
      const record = this.table.get(name);
      if (!record) { continue; }
      const { status, retry, state } = record;
      switch (status) {
        case ReadvertiseDestination.Status.ADVERTISING: {
          try {
            await this.doAdvertise(name, state);
            if (record.status === ReadvertiseDestination.Status.ADVERTISING) {
              record.status = ReadvertiseDestination.Status.ADVERTISED;
              retry!.stop();
            }
          } catch (err: unknown) {
            retry!.retry(err as Error);
          }
          break;
        }
        case ReadvertiseDestination.Status.WITHDRAWING: {
          try {
            await this.doWithdraw(name, state);
            if (record.status === ReadvertiseDestination.Status.WITHDRAWING) {
              record.status = ReadvertiseDestination.Status.WITHDRAWN;
              retry!.stop();
              this.table.delete(name);
            }
          } catch (err: unknown) {
            retry!.retry(err as Error);
          }
          break;
        }
      }
    }
  }

  /** Create per-prefix state. */
  protected makeState(name: Name): State {
    void name;
    return {} as any;
  }

  /** Advertise a prefix once. */
  protected abstract doAdvertise(name: Name, state: State): Promise<void>;

  /** Withdraw a prefix once. */
  protected abstract doWithdraw(name: Name, state: State): Promise<void>;
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
    status: Status;
    retry?: retry.RetryOperation;
    state: State;
  }
}
