import { Name, NameMap } from "@ndn/packet";
import { assert, getOrInsert, pushable } from "@ndn/util";
import filter from "obliterator/filter.js";
import * as retry from "retry";

import type { FaceImpl, FwFace } from "./face";
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

  public readonly destinations = new Set<ReadvertiseDestination>();

  /**
   * Prefix announcements arranged by name.
   *
   * NameMap key is the announced name.
   * Map key is a reference to the FwFace announcing the name.
   * Map value is an array of announcements made by the FwFace.
   * Array contains application supplied announcement objects or `undefined` for plain names.
   * Neither the Map nor the Array may be empty.
   *
   * More than one FwFaces can announce the same name simultaneously.
   * An FwFace can announce the same name more than once.
   * This stack of containers is to deduplicate these announcements.
   *
   * A name is being announced if at least one FwFace announces the name at least once.
   */
  public readonly byName = new NameMap<Map<FaceImpl, Array<FwFace.PrefixAnnouncementObj | undefined>>>();

  /**
   * Prefix announcements arranged by FwFace.
   *
   * Outer key is the FwFace.
   * Inner key is the announced name in hex.
   * Inner key is the announced name.
   *
   * This is for deleting all announcements from a FwFace.
   */
  private readonly byFace = new Map<FaceImpl, Map<string, Name>>();

  public addAnnouncement(face: FaceImpl, ann: FwFace.PrefixAnnouncement): void {
    const [name, pa] = splitAnnouncement(ann);

    const nameFaces = getOrInsert(this.byName, name, () => new Map());
    const isNewName = nameFaces.size === 0; // no face was announcing this name
    const nameFaceAnns = getOrInsert(nameFaces, face, () => []);
    if (nameFaceAnns.length === 0) { // this face was not announcing this name
      const faceNames = getOrInsert(this.byFace, face, () => new Map());
      faceNames.set(name.valueHex, name);
    }
    nameFaceAnns.push(pa);

    if (!isNewName) {
      return;
    }
    this.fw.dispatchTypedEvent("annadd", new Forwarder.AnnouncementEvent("annadd", name));
    for (const dest of this.destinations) {
      dest.advertise(name);
    }
  }

  public removeAnnouncement(face: FaceImpl, ann: FwFace.PrefixAnnouncement): void {
    const [name, pa] = splitAnnouncement(ann);
    this.removeAnnouncementImpl(face, name, (nameFaceAnns) => {
      // If ann is an announcement object, find the same object (must be same instance).
      // If ann is a plain name (pa is undefined), find another plain name.
      // In case of no match, delete an arbitrary item from the array.
      const i = Math.max(nameFaceAnns.indexOf(pa), 0);
      nameFaceAnns.splice(i, 1);
    });
  }

  private removeAnnouncementImpl(
      face: FaceImpl, name: Name,
      delPa: (nameFaceAnns: Array<FwFace.PrefixAnnouncementObj | undefined>) => void,
  ): void {
    const nameFaces = this.byName.get(name);
    const nameFaceAnns = nameFaces?.get(face);
    if (!nameFaceAnns?.length) { // face was not announcing this name
      return;
    }

    delPa(nameFaceAnns);
    if (nameFaceAnns.length > 0) { // face is still announcing this name
      return;
    }
    // face is no longer announcing the name

    const faceNames = this.byFace.get(face)!;
    faceNames.delete(name.valueHex);
    if (faceNames.size === 0) { // face is no longer announcing any name
      this.byFace.delete(face);
    }

    nameFaces!.delete(face);
    if (nameFaces!.size > 0) { // name is still announced by another face
      return;
    }
    // name is no longer announced by any face
    this.byName.delete(name);

    this.fw.dispatchTypedEvent("annrm", new Forwarder.AnnouncementEvent("annrm", name));
    for (const dest of this.destinations) {
      dest.withdraw(name);
    }
  }

  public clearFace(face: FaceImpl): void {
    const faceNames = this.byFace.get(face);
    if (!faceNames) {
      return;
    }

    for (const name of faceNames.values()) {
      this.removeAnnouncementImpl(face, name, (nameFaceAnns) => nameFaceAnns.splice(0));
    }
    assert(!this.byFace.has(face));
  }

  public *listAnnouncementObjs(name: Name): Iterable<FwFace.PrefixAnnouncementObj> {
    const nameFaces = this.byName.get(name);
    if (!nameFaces) {
      return;
    }
    for (const nameFaceAnns of nameFaces.values()) {
      yield* filter(nameFaceAnns, (ann) => !!ann) as Iterable<FwFace.PrefixAnnouncementObj>;
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
  protected readonly queue = pushable<Name>();
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
    for (const [name] of this.readvertise.byName) {
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
    this.queue.stop();
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

  protected restart(name: Name, record: ReadvertiseDestination.Record<State>): void {
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

  private async process(): Promise<void> {
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

  /**
   * Create per-prefix state.
   *
   * @remarks
   * Must override if State type parameter is changed from the default.
   */
  protected makeState(name: Name): State {
    void name;
    return {} as any;
  }

  /**
   * Retrieve application supplied prefix announcement objects.
   *
   * @remarks
   * This is only available during {@link makeState} and {@link doAdvertise}.
   */
  protected listAnnouncementObjs(name: Name): Iterable<FwFace.PrefixAnnouncementObj> {
    return this.readvertise!.listAnnouncementObjs(name);
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

function splitAnnouncement(ann: FwFace.PrefixAnnouncement): [Name, FwFace.PrefixAnnouncementObj | undefined] {
  if (Name.isNameLike(ann)) {
    return [Name.from(ann), undefined];
  }
  return [ann.announced, ann];
}
