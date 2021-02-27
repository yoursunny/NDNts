import { EventEmitter } from "events";
import MultiMap from "mnemonist/multi-map.js";
import type TypedEmitter from "typed-emitter";

import type { Subscription } from "../types";

class Sub<Topic, Update> extends (EventEmitter as new() => TypedEmitter<Subscription.Events<any>>) implements Subscription<Topic, Update> {
  constructor(
      public readonly topic: Topic,
      public readonly remove: () => void,
  ) {
    super();
  }
}

export class SubscriptionTable<Topic, Update, Key = unknown, SubscribeInfo = undefined>
implements Iterable<[Key, Set<Subscription<Topic, Update>>]> {
  constructor(
      private readonly topic2key: (topic: Topic) => Key,
  ) {}

  public handleAddTopic?: (topic: Topic, key: Key, set: Set<Subscription<Topic, Update>>, info: SubscribeInfo) => void;
  public handleRemoveTopic?: (topic: Topic, key: Key, set: Set<Subscription<Topic, Update>>) => void;

  private readonly table = new MultiMap<Key, Sub<Topic, Update>>(Set);

  public get(key: Key): Set<Subscription<Topic, Update>>|undefined {
    return this.table.get(key);
  }

  public [Symbol.iterator]() {
    return this.table.associations();
  }

  public add(topic: Topic, info: SubscribeInfo): Subscription<Topic, Update> {
    const key = this.topic2key(topic);
    const sub: Sub<Topic, Update> = new Sub(topic, () => this.remove(key, sub));
    this.table.set(key, sub);

    const set = this.table.get(key)!;
    if (set.size === 1) {
      this.handleAddTopic?.(topic, key, set, info);
    }
    return sub;
  }

  private remove(key: Key, sub: Sub<Topic, Update>): void {
    const set = this.table.get(key);
    if (this.table.remove(key, sub) && !this.table.has(key)) {
      this.handleRemoveTopic?.(sub.topic, key, set!);
    }
  }

  public update(set: Set<Subscription<Topic, Update>>, update: Update): void {
    for (const sub of set) {
      sub.emit("update", update);
    }
  }
}
