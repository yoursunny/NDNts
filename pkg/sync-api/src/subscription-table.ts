import { type Name, NameMultiMap } from "@ndn/packet";
import { TypedEventTarget } from "typescript-event-target";

import type { Subscription } from "./pubsub";

class Sub<Update extends Event> extends TypedEventTarget<Subscription.EventMap<any>> implements Subscription<Name, Update> {
  constructor(
      public readonly topic: Name,
      private readonly dispose_: () => void,
  ) {
    super();
  }

  public [Symbol.dispose](): void {
    this.dispose_();
  }
}

/**
 * Track subscriptions in a pubsub protocol.
 * This is primarily useful to pubsub protocol implementors.
 */
export class SubscriptionTable<Update extends Event> extends NameMultiMap<Subscription<Name, Update>> {
  /** Callback when the last subscriber of a topic is removed. */
  public handleRemoveTopic?: (
    topic: Name,
    objKey: object, // eslint-disable-line @typescript-eslint/no-restricted-types
  ) => void;

  /**
   * Subscribe to a topic.
   * @param topic - Topic name.
   * @returns
   * - `sub`: Subscription object.
   * - `objKey`: WeakMap-compatible key associated with the topic, only provided in the first
   *   subscription.
   */
  public subscribe(topic: Name): {
    sub: Subscription<Name, Update>;
    objKey?: object; // eslint-disable-line @typescript-eslint/no-restricted-types
  } {
    const sub: Sub<Update> = new Sub<Update>(topic, () => this.unsubscribe(topic, sub));
    let objKey: object | undefined;// eslint-disable-line @typescript-eslint/no-restricted-types
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

  /**
   * Deliver an update to a set of subscriptions.
   *
   * @remarks
   * The caller should ensure the update matches the subscription topic name.
   */
  public update(set: Iterable<Subscription<Name, Update>>, update: Update): void {
    for (const sub of set) {
      sub.dispatchTypedEvent("update", update);
    }
  }
}
