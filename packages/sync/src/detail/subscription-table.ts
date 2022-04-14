import { type Name, NameMultiMap } from "@ndn/packet";
import { EventEmitter } from "node:events";
import type TypedEmitter from "typed-emitter";

import type { Subscription } from "../types";

class Sub<Update> extends (EventEmitter as new() => TypedEmitter<Subscription.Events<any>>) implements Subscription<Name, Update> {
  constructor(
      public readonly topic: Name,
      public readonly remove: () => void,
  ) {
    super();
  }
}

export class SubscriptionTable<Update> extends NameMultiMap<Sub<Update>> {
  public handleRemoveTopic?: (topic: Name, objKey: object) => void;

  public subscribe(topic: Name): { sub: Subscription<Name, Update>; objKey?: object } {
    const sub: Sub<Update> = new Sub(topic, () => this.unsubscribe(topic, sub));
    let objKey: object | undefined;
    if (this.add(topic, sub) === 1) {
      objKey = this.list(topic);
    }
    return { sub, objKey };
  }

  private unsubscribe(topic: Name, sub: Sub<Update>): void {
    const set = this.list(topic);
    if (this.remove(topic, sub) === 0) {
      this.handleRemoveTopic?.(topic, set);
    }
  }

  public update(set: ReadonlySet<Subscription<Name, Update>>, update: Update): void {
    for (const sub of set) {
      sub.emit("update", update);
    }
  }
}
