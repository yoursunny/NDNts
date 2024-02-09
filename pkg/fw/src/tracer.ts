import { Data, Interest, Nack } from "@ndn/packet";
import { console } from "@ndn/util";

import type { FwFace } from "./face";
import { Forwarder } from "./forwarder";
import type { FwPacket } from "./packet";

/** Print trace logs from {@link Forwarder} events. */
export class FwTracer {
  public static enable(opts: FwTracer.Options = {}): FwTracer {
    return new FwTracer(opts);
  }

  private readonly output: FwTracer.Output;
  private readonly fw: Forwarder;

  private constructor({
    output = console,
    fw = Forwarder.getDefault(),
    face = true,
    prefix = true,
    ann = true,
    pkt = true,
  }: FwTracer.Options) {
    this.output = output;
    this.fw = fw;
    if (face) {
      this.fw.addEventListener("faceadd", this.faceadd);
      this.fw.addEventListener("facerm", this.facerm);
    }
    if (prefix) {
      this.fw.addEventListener("prefixadd", this.prefixadd);
      this.fw.addEventListener("prefixrm", this.prefixrm);
    }
    if (ann) {
      this.fw.addEventListener("annadd", this.annadd);
      this.fw.addEventListener("annrm", this.annrm);
    }
    if (pkt) {
      this.fw.addEventListener("pktrx", this.pktrx);
      this.fw.addEventListener("pkttx", this.pkttx);
    }
  }

  public disable(): void {
    this.fw.removeEventListener("faceadd", this.faceadd);
    this.fw.removeEventListener("facerm", this.facerm);
    this.fw.removeEventListener("prefixadd", this.prefixadd);
    this.fw.removeEventListener("prefixrm", this.prefixrm);
    this.fw.removeEventListener("annadd", this.annadd);
    this.fw.removeEventListener("annrm", this.annrm);
    this.fw.removeEventListener("pktrx", this.pktrx);
    this.fw.removeEventListener("pkttx", this.pkttx);
  }

  private readonly faceadd = ({ face }: Forwarder.FaceEvent) => {
    this.output.log(`+Face ${face}`);
  };

  private readonly facerm = ({ face }: Forwarder.FaceEvent) => {
    this.output.log(`-Face ${face}`);
  };

  private readonly prefixadd = ({ face, prefix }: Forwarder.PrefixEvent) => {
    this.output.log(`${face} +Prefix ${prefix}`);
  };

  private readonly prefixrm = ({ face, prefix }: Forwarder.PrefixEvent) => {
    this.output.log(`${face} -Prefix ${prefix}`);
  };

  private readonly annadd = ({ name }: Forwarder.AnnouncementEvent) => {
    this.output.log(`+Announcement ${name}`);
  };

  private readonly annrm = ({ name }: Forwarder.AnnouncementEvent) => {
    this.output.log(`-Announcement ${name}`);
  };

  private readonly pktrx = ({ face, packet }: Forwarder.PacketEvent) => {
    this.pkt(face, packet, ">");
  };

  private readonly pkttx = ({ face, packet }: Forwarder.PacketEvent) => {
    this.pkt(face, packet, "<");
  };

  private pkt(face: FwFace, pkt: FwPacket, dir: string) {
    switch (true) {
      case pkt.l3 instanceof Interest: {
        const act = pkt.cancel ? "Cancel" :
          pkt.reject ? `Reject(${pkt.reject})` :
          "I";
        this.output.log(`${face} ${dir}${act} ${interestToString(pkt.l3)}`);
        break;
      }
      case pkt.l3 instanceof Data: {
        const { name } = pkt.l3;
        this.output.log(`${face} ${dir}D ${name}`);
        break;
      }
      case pkt.l3 instanceof Nack: {
        const { interest, reason } = pkt.l3;
        this.output.log(`${face} ${dir}N ${interestToString(interest)}~${reason}`);
        break;
      }
    }
  }
}

function interestToString({ name, canBePrefix, mustBeFresh }: Interest): string {
  return `${name}${canBePrefix ? "[P]" : ""}${mustBeFresh ? "[F]" : ""}`;
}

export namespace FwTracer {
  export interface Output {
    log: (str: string) => void;
  }

  export interface Options {
    /**
     * Where to write log entries.
     * @defaultValue `console`
     */
    output?: Output;

    /**
     * Logical Forwarder instance.
     * @defaultValue `Forwarder.getDefault()`
     */
    fw?: Forwarder;

    /**
     * Whether to log face creations and deletions.
     * @defaultValue true
     */
    face?: boolean;

    /**
     * Whether to log prefix registrations.
     * @defaultValue true
     */
    prefix?: boolean;

    /**
     * Whether to log prefix announcements.
     * @defaultValue true
     */
    ann?: boolean;

    /**
     * Whether to log packets.
     * @defaultValue true
     */
    pkt?: boolean;
  }
}
