import type { Name } from "@ndn/packet";
import type { TypedEventTarget } from "typescript-event-target";

import type { SyncUpdate } from "./sync";

/** A pubsub protocol subscriber. */
export interface Subscriber<Topic = Name, Update extends Event = SyncUpdate<Topic>, SubscribeInfo = Topic> {
  subscribe(topic: SubscribeInfo): Subscription<Topic, Update>;
}

/**
 * A subscription on a topic.
 *
 * @remarks
 * Listen to the 'update' event to receive updates on incoming publications matching the topic.
 */
export interface Subscription<Topic = Name, Update extends Event = SyncUpdate<Topic>> extends TypedEventTarget<Subscription.EventMap<Update>> {
  /** The topic. */
  readonly topic: Topic;

  /** Unsubscribe. */
  remove(): void;
}

export namespace Subscription {
  export type EventMap<Update extends Event> = {
    /** Emitted when a subscription update is received. */
    update: Update;
  };
}
