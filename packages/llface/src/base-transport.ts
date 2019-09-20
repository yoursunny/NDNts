import { EventEmitter } from "events";
import * as rPromise from "remote-controlled-promise";

import { Emitter } from "./transport-events";

export abstract class BaseTransport<Rx extends NodeJS.ReadableStream,
                                    Tx extends NodeJS.WritableStream = NodeJS.WritableStream>
       extends (EventEmitter as new() => Emitter) {
  protected closing: rPromise.ControlledPromise<void>|undefined;

  protected constructor(public readonly rx: Rx, public readonly tx: Tx) {
    super();
  }

  protected handlePipelineError = (error?: Error|null) => {
    if (this.closing) {
      this.emit("end", undefined);
    } else {
      this.closing = rPromise.create();
      this.emit("end", error || undefined);
    }
    this.closing.resolve();
  }

  protected closeImpl(disconnect: () => any): Promise<void> {
    if (!this.closing) {
      this.closing = rPromise.create();
      disconnect();
    }
    return this.closing.promise;
  }
}
