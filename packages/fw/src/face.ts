import { Data, Interest } from "@ndn/l3pkt";
import { Name } from "@ndn/name";
import pDefer from "p-defer";
import Fifo from "p-fifo";
import { buffer, filter, pipeline } from "streaming-iterables";

import { ForwarderImpl } from "./forwarder";
import { CancelInterest, InterestToken, Rxable, Txable } from "./reqres";

const STOP = Symbol("FaceImpl.Stop");

export class FaceImpl {
  public readonly stopping = pDefer<typeof STOP>();
  public running = true;
  public readonly routes = new Map<string, Name>();
  public readonly txQueue = new Fifo<Txable>();
  public txQueueLength = 0;

  constructor(private readonly fw: ForwarderImpl,
              public readonly face: Face.L3) {
    fw.faces.add(this);
    pipeline(
      () => this.txLoop(),
      buffer(this.fw.options.faceTxBuffer),
      this.getTransform(),
      buffer(this.fw.options.faceRxBuffer),
      this.rxLoop,
    );
  }

  public close() {
    if (!this.running) {
      return;
    }
    this.running = false;
    this.fw.faces.delete(this);
    this.stopping.resolve(STOP);
  }

  public addRoute(prefix: Name) {
    this.routes.set(prefix.toString(), prefix);
  }

  public removeRoute(prefix: Name) {
    this.routes.delete(prefix.toString());
  }

  public findRoute(name: Name): number {
    let longestNameLength = -1;
    for (const prefix of this.routes.values()) {
      if (prefix.isPrefixOf(name)) {
        longestNameLength = Math.max(longestNameLength, prefix.length);
      }
    }
    return longestNameLength;
  }

  public async send(pkt: Txable) {
    ++this.txQueueLength;
    await this.txQueue.push(pkt);
    --this.txQueueLength;
  }

  private getTransform(): Face.Transform {
    const rxtx = this.face.rxtx;
    if (typeof rxtx === "function") {
      return rxtx;
    }
    return (iterable) => {
      rxtx.tx(iterable);
      return rxtx.rx;
    };
  }

  private rxLoop = async (input: AsyncIterable<Rxable>) => {
    for await (const pkt of filter(() => this.running, input)) {
      switch (true) {
        case pkt instanceof Interest:
          this.fw.processInterest(this, pkt as Interest, pkt[InterestToken]);
          break;
        case pkt instanceof Data:
          this.fw.processData(this, pkt as Data);
          break;
        case pkt instanceof CancelInterest:
          this.fw.cancelInterest(this, (pkt as CancelInterest).interest);
          break;
      }
    }
    this.close();
  }

  private async *txLoop() {
    while (true) {
      const pkt = await Promise.race([
        this.stopping.promise,
        this.txQueue.shift(),
      ]);
      if (pkt === STOP) {
        break;
      }
      yield pkt;
    }
    this.close();
  }
}

export namespace FaceImpl {
  export interface Options {
    faceRxBuffer: number;
    faceTxBuffer: number;
  }

  export const DefaultOptions = {
    faceRxBuffer: 16,
    faceTxBuffer: 16,
  } as Options;
}

export type Face = Pick<FaceImpl, "close"|"addRoute"|"removeRoute">;

export namespace Face {
  export type Transform = (iterable: AsyncIterable<Txable>) => AsyncIterable<Rxable>;

  export interface RxTx {
    rx: AsyncIterable<Rxable>;
    tx(iterable: AsyncIterable<Txable>): any;
  }

  export interface L3 {
    rxtx: Transform|RxTx;
  }
}
