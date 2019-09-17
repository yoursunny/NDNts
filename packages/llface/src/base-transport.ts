import SimpleSignal from "simplesignal";

import { Transport } from "./transport";

export abstract class BaseTransport<Rx extends NodeJS.ReadableStream,
                                    Tx extends NodeJS.WritableStream = NodeJS.WritableStream> {
  public readonly onEnd = new SimpleSignal<Transport.EndCallback>();
  protected closed = false;

  protected constructor(public readonly rx: Rx, public readonly tx: Tx) {
  }

  protected handlePipelineError = (error?: Error|null) => {
    this.closed = true;
    this.onEnd.dispatch(error);
    this.onEnd.removeAll();
  }

  protected async closeImpl(disconnect: () => any): Promise<void> {
    if (this.closed) {
      return;
    }
    return new Promise<void>((resolve) => {
      this.onEnd.add(() => { resolve(); });
      disconnect();
    });
  }
}
