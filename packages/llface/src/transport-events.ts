import { EventEmitter } from "events";
import { StrictEventEmitter } from "strict-event-emitter-types";

interface Events {
  /** Emitted when the transport has closed. */
  end: Error|undefined;
}

export type TransportEmitter = StrictEventEmitter<EventEmitter, Events>;
