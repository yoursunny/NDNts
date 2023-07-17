import { assert, MultiMap } from "@ndn/util";
import { pushable } from "it-pushable";
import DefaultWeakMap from "mnemonist/default-weak-map.js";

import type { FaceImpl, FwFace } from "./face";
import { Forwarder } from "./forwarder";
import type { FwPacket } from "./packet";

class TapRxController {
  private static instances = new DefaultWeakMap<Forwarder, TapRxController>((fw) => new TapRxController(fw));

  public static lookup(fw: Forwarder): TapRxController {
    return TapRxController.instances.get(fw);
  }

  private readonly taps = new MultiMap<FwFace, TapFace>();

  private constructor(private readonly fw: Forwarder) {
    this.fw.addEventListener("pktrx", this.pktrx);
    this.fw.addEventListener("facerm", this.facerm);
  }

  public add(src: FwFace, dst: TapFace) {
    assert.equal(src.fw, this.fw);
    this.taps.add(src, dst);
  }

  public remove(src: FwFace, dst: TapFace) {
    this.taps.remove(src, dst);
    this.detachIfIdle();
  }

  private facerm = (evt: Forwarder.FaceEvent) => {
    const dst = this.taps.list(evt.face);
    for (const { rx } of dst) {
      rx.end();
    }
    this.detachIfIdle();
  };

  private detachIfIdle() {
    if (this.taps.size === 0) {
      this.fw.removeEventListener("pktrx", this.pktrx);
      this.fw.removeEventListener("facerm", this.facerm);
      TapRxController.instances.delete(this.fw);
    }
  }

  private pktrx = (evt: Forwarder.PacketEvent) => {
    const dst = this.taps.list(evt.face);
    for (const { rx } of dst) {
      rx.push(evt.packet);
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
export class TapFace implements FwFace.RxTx {
  public get attributes() {
    return {
      describe: `tap(${this.face})`,
      ...this.face.attributes,
    };
  }

  public readonly rx = pushable<FwPacket>({ objectMode: true });
  private readonly ctrl: TapRxController;

  constructor(public readonly face: FwFace) {
    this.ctrl = TapRxController.lookup(face.fw);
    this.ctrl.add(this.face, this);
  }

  public tx = async (iterable: AsyncIterable<FwPacket>) => {
    for await (const pkt of iterable) {
      (this.face as FaceImpl).send(pkt);
    }
    this.ctrl.remove(this.face, this);
  };
}

export namespace TapFace {
  /** Create a new Forwarder and add a TapFace. */
  export function create(face: FwFace): FwFace {
    const fw = Forwarder.create();
    return fw.addFace(new TapFace(face));
  }
}
