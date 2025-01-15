import { assert, MultiMap, pushable } from "@ndn/util";
import DefaultWeakMap from "mnemonist/default-weak-map.js";

import type { FaceImpl, FwFace } from "./face";
import { Forwarder } from "./forwarder";
import type { FwPacket } from "./packet";

class TapRxController {
  private readonly taps = new MultiMap<FwFace, TapFace>();

  constructor(private readonly fw: Forwarder) {
    this.fw.addEventListener("pktrx", this.pktrx);
    this.fw.addEventListener("facerm", this.facerm);
  }

  public add(src: FwFace, dst: TapFace) {
    assert(src.fw === this.fw);
    this.taps.add(src, dst);
  }

  public remove(src: FwFace, dst: TapFace) {
    this.taps.remove(src, dst);
    this.detachIfIdle();
  }

  private readonly facerm = (evt: Forwarder.FaceEvent) => {
    const dst = this.taps.list(evt.face);
    for (const { rx } of dst) {
      rx.stop();
    }
    this.detachIfIdle();
  };

  private detachIfIdle() {
    if (this.taps.size === 0) {
      this.fw.removeEventListener("pktrx", this.pktrx);
      this.fw.removeEventListener("facerm", this.facerm);
      ctrls.delete(this.fw);
    }
  }

  private readonly pktrx = (evt: Forwarder.PacketEvent) => {
    const dst = this.taps.list(evt.face);
    for (const { rx } of dst) {
      rx.push(evt.packet);
    }
  };
}

const ctrls = new DefaultWeakMap<Forwarder, TapRxController>((fw) => new TapRxController(fw));

/**
 * Create a secondary face that shares the transport of a primary face.
 *
 * @remarks
 * TapFace is useful for sending in-band management commands to a specific neighbor, after being
 * added to a temporary secondary Forwarder. The TapFace shares the same transport as the primary
 * face, but allows independent FIB and PIT settings. The primary Forwarder will see RX packets,
 * but does not see TX packets.
 */
export class TapFace implements FwFace.RxTx {
  /**
   * Create a new secondary {@link Forwarder} and add a {@link TapFace}.
   * @param face - FwFace on the existing primary forwarder.
   * @returns FwFace on a new forwarder. The forwarder may be retrieved in `.fw` property.
   */
  public static create(face: FwFace): FwFace {
    const fw = Forwarder.create();
    return fw.addFace(new TapFace(face));
  }

  private constructor(public readonly face: FwFace) {
    this.ctrl = ctrls.get(face.fw);
    this.ctrl.add(face, this);
  }

  public get attributes() {
    return {
      ...this.face.attributes,
      describe: `tap(${this.face})`,
    };
  }

  private readonly ctrl: TapRxController;

  public readonly rx = pushable<FwPacket>();

  public async tx(iterable: AsyncIterable<FwPacket>) {
    for await (const pkt of iterable) {
      (this.face as FaceImpl).send(pkt);
    }
    this.ctrl.remove(this.face, this);
  }
}
