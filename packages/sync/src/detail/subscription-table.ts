import { type Name, NameMultiMap } from "@ndn/packet";
import { TypedEventTarget } from "typescript-event-target";

import type { Subscription } from "../types";

class Sub<Update extends Event> extends TypedEventTarget<Subscription.EventMap<any>> implements Subscription<Name, Update> {
  constructor(
      public readonly topic: Name,
      public readonly remove: () => void,
  ) {
    super();
  }
}

export class SubscriptionTable<Update extends Event> extends NameMultiMap<Subscription<Name, Update>> {
  public handleRemoveTopic?: (topic: Name, objKey: object) => void;

  public subscribe(topic: Name): { sub: Subscription<Name, Update>; objKey?: object } {
    const sub: Sub<Update> = new Sub<Update>(topic, () => this.unsubscribe(topic, sub));
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

  public update(set: Iterable<Subscription<Name, Update>>, update: Update): void {
    for (const sub of set) {
      sub.dispatchTypedEvent("update", update);
    }
  }
}
