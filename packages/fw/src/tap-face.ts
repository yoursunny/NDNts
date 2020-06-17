import pushable from "it-pushable";
import assert from "minimalistic-assert";
import DefaultWeakMap from "mnemonist/default-weak-map";
import MultiMap from "mnemonist/multi-map";

import { Face, FaceImpl } from "./face";
import { Forwarder } from "./forwarder";

class TapRxController {
  private static instances = new DefaultWeakMap<Forwarder, TapRxController>((fw) => new TapRxController(fw));

  public static lookup(fw: Forwarder): TapRxController {
    return TapRxController.instances.get(fw);
  }

  private readonly taps = new MultiMap<Face, TapFace>(Set);

  private constructor(private readonly fw: Forwarder) {
    this.fw.on("pktrx", this.pktrx);
    this.fw.on("facerm", this.facerm);
  }

  public add(src: Face, dst: TapFace) {
    assert.equal(src.fw, this.fw);
    this.taps.set(src, dst);
  }

  public remove(src: Face, dst: TapFace) {
    this.taps.remove(src, dst);
    this.detachIfIdle();
  }

  private facerm = (src: Face) => {
    const dst = this.taps.get(src);
    if (dst) {
      for (const { rx } of dst) {
        rx.end();
      }
    }
    this.detachIfIdle();
  };

  private detachIfIdle() {
    if (this.taps.size === 0) {
      this.fw.off("pktrx", this.pktrx);
      this.fw.off("facerm", this.facerm);
      TapRxController.instances.delete(this.fw);
    }
  }

  private pktrx = (src: Face, pkt: Face.Rxable) => {
    const dst = this.taps.get(src);
    if (dst) {
      for (const { rx } of dst) {
        rx.push(pkt);
      }
    }
  };
}

/**
 * Create a secondary face by tapping on a primary face.
 *
 * TapFace is useful for sending in-band management commands to a specific neighbor, after being
 * added to a temporary secondary Forwarder. The TapFace shares the same transport as the primary
 * face, but allows independent FIB and PIT settings. The primary Forwarder will see RX packets,
 * but does not see TX packets.
 */
export class TapFace {
  public get attributes() { return this.face.attributes; }
  public readonly extendedTx = true;
  public readonly rx = pushable<Face.Rxable>();
  private readonly ctrl: TapRxController;

  constructor(public readonly face: Face) {
    this.ctrl = TapRxController.lookup(face.fw);
    this.ctrl.add(this.face, this);
  }

  public async tx(iterable: AsyncIterable<Face.Txable>) {
    for await (const pkt of iterable) {
      (this.face as FaceImpl).send(pkt);
    }
    this.ctrl.remove(this.face, this);
  }

  public toString() {
    return `tap(${this.face})`;
  }
}

export namespace TapFace {
  /** Create a new Forwarder and add a TapFace. */
  export function create(face: Face): Face {
    const fw = Forwarder.create();
    return fw.addFace(new TapFace(face));
  }
}
