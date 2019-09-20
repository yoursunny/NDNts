import { EventEmitter } from "events";

import { TransportEmitter } from "./transport-events";

export abstract class BaseTransport<Rx extends NodeJS.ReadableStream,
                                    Tx extends NodeJS.WritableStream = NodeJS.WritableStream>
       extends (EventEmitter as new() => TransportEmitter) {
  protected closed = false;

  protected constructor(public readonly rx: Rx, public readonly tx: Tx) {
    super();
  }

  protected handlePipelineError = (error?: Error|null) => {
    if (this.closed) {
      return;
    }
    this.closed = true;
    this.emit("end", error || undefined);
  }

  protected async closeImpl(disconnect: () => any): Promise<void> {
    if (this.closed) {
      return;
    }
    return new Promise<void>((resolve) => {
      this.once("end", () => { resolve(); });
      disconnect();
    });
  }
}
