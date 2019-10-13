import TinyQueue from "tinyqueue";

import { CancelInterest, Packet } from "../src";

interface TimedPacket {
  pkt: Packet|CancelInterest;
  time: number;
}

function compareTimedPacket(a: TimedPacket, b: TimedPacket): number {
  return a.time - b.time;
}

export class TimedFaceRx {
  public now = -1;
  private queue = new TinyQueue<TimedPacket>([], compareTimedPacket);

  constructor(private readonly endTime: number) {
  }

  public add(time: number, pkt: Packet|CancelInterest): this {
    this.queue.push({ pkt, time });
    return this;
  }

  public get rx() { return this.rxGenerator(); }

  private async *rxGenerator() {
    this.now = 0;
    const until = async (t: number) => {
      if (t <= this.now) {
        return;
      }
      await new Promise((r) => setTimeout(r, t - this.now));
      this.now = t;
    };

    while (this.queue.length) {
      const { pkt, time } = this.queue.pop()!;
      await until(time);
      yield pkt;
    }
    await until(this.endTime);
  }
}
