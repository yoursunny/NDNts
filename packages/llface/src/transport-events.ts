import { EventEmitter } from "events";
import { StrictEventEmitter } from "strict-event-emitter-types";

export interface Events {
  /** Emitted when the transport has closed. */
  end: Error|undefined;
}

export type Emitter = StrictEventEmitter<EventEmitter, Events>;
